import { useEffect, useRef, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import MapboxDraw from '@mapbox/mapbox-gl-draw';
import '@mapbox/mapbox-gl-draw/dist/mapbox-gl-draw.css';
import * as turf from '@turf/turf';
import { useAnalysis } from '../../context/AnalysisContext';
import { API_BASE, TILE_BASE } from '../../config/constants';
import { Target, Pencil, Trash2, Zap, Loader2, Minus, Plus, Layers, Compass } from 'lucide-react';
import { GeoSearch } from './GeoSearch';
import { buildSources, MAP_LAYERS } from './mapLayerConfig';

type MapMode = 'martin' | 'satellite' | 'hybrid' | 'osm';

// SVG pin definitions — keyed so they can be registered eagerly on map load
const PIN_SVGS: Record<string, string> = {
  'pin-google': `<svg width="32" height="42" viewBox="0 0 32 42" xmlns="http://www.w3.org/2000/svg"><path d="M16 2C8.268 2 2 8.268 2 16c0 10 14 24 14 24s14-14 14-24c0-7.732-6.268-14-14-14z" fill="#4f9cf9" stroke="#161b22" stroke-width="2"/><circle cx="16" cy="15" r="5" fill="#ffffff"/></svg>`,
  'pin-osm-google': `<svg width="32" height="42" viewBox="0 0 32 42" xmlns="http://www.w3.org/2000/svg"><path d="M16 2C8.268 2 2 8.268 2 16c0 10 14 24 14 24s14-14 14-24c0-7.732-6.268-14-14-14z" fill="#3fb950" stroke="#161b22" stroke-width="2"/><circle cx="16" cy="15" r="5" fill="#ffffff"/></svg>`,
  'pin-osm': `<svg width="32" height="42" viewBox="0 0 32 42" xmlns="http://www.w3.org/2000/svg"><path d="M16 2C8.268 2 2 8.268 2 16c0 10 14 24 14 24s14-14 14-24c0-7.732-6.268-14-14-14z" fill="#ffa657" stroke="#161b22" stroke-width="2"/><circle cx="16" cy="15" r="5" fill="#ffffff"/></svg>`,
  'pin-gap': `<svg width="32" height="44" viewBox="0 0 32 44" xmlns="http://www.w3.org/2000/svg"><path d="M16 2L30 16L16 42L2 16Z" fill="#7ee787" stroke="#161b22" stroke-width="2"/><circle cx="16" cy="16" r="5" fill="#ffffff"/></svg>`,
  // Transit pin — purple teardrop with a bus icon inside
  'pin-transit': `<svg width="32" height="42" viewBox="0 0 32 42" xmlns="http://www.w3.org/2000/svg">
    <path d="M16 2C8.268 2 2 8.268 2 16c0 10 14 24 14 24s14-14 14-24c0-7.732-6.268-14-14-14z" fill="#818cf8" stroke="#1e1b4b" stroke-width="1.5"/>
    <rect x="9" y="8" width="14" height="9" rx="2" fill="white" opacity="0.92"/>
    <rect x="10" y="9" width="12" height="4" rx="1" fill="#818cf8"/>
    <line x1="16" y1="13" x2="16" y2="17" stroke="white" stroke-width="1" opacity="0.7"/>
    <circle cx="11.5" cy="18.5" r="1.8" fill="white" opacity="0.9"/>
    <circle cx="20.5" cy="18.5" r="1.8" fill="white" opacity="0.9"/>
  </svg>`,
};

function registerPinImages(map: maplibregl.Map) {
  Object.entries(PIN_SVGS).forEach(([id, svg]) => {
    if (map.hasImage(id)) return;
    const img = new Image(32, 44);
    img.onload = () => { if (!map.hasImage(id)) map.addImage(id, img, { pixelRatio: 2 }); };
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  });
}

export function MapContainer() {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const drawRef = useRef<MapboxDraw | null>(null);
  const searchMarkerRef = useRef<maplibregl.Marker | null>(null);
  const selectedPoiMarkerRef = useRef<maplibregl.Marker | null>(null);
  const mapPopupRef = useRef<maplibregl.Popup | null>(null);
  // Ref so async callbacks can read latest activeTab without stale closure.
  // Cannot use activeTab here (declared by useAnalysis() below) — initialize with default.
  const activeTabRef = useRef('demand-mix');
  const [mapMode, setMapMode] = useState<MapMode>('osm');
  const [showPicker, setShowPicker] = useState(false);
  const [searchPortal, setSearchPortal] = useState<HTMLElement | null>(null);

  useEffect(() => {
    setSearchPortal(document.getElementById('search-portal-target'));
  }, []);

  const {
    sitePin, setSitePin, radius, setRadius,
    analysisType, setAnalysisType, drawnPolygon, setDrawnPolygon,
    setAnalysisData, isLoading, runAnalysis, isMobile,
    ndviData, analysisData,
    selectedPoi, setSelectedPoi,
    activeTab, competitorMode, competitorData, opportunityData,
    cannibalizationData, existingOutlets,
    footfallMode, demandMixData,
  } = useAnalysis();

  // Keep ref in sync so async effects can read latest activeTab without stale closure
  useEffect(() => { activeTabRef.current = activeTab; }, [activeTab]);

  // ── Camera Padding Helper ────────────────────────────────────────────────
  // Asymmetrical padding to account for the top search bar/title and the bottom
  // Analyse pill so the focal point is in the true visual center of the unobscured map.
  const getCameraPadding = useCallback((basePad = 0) => {
    return isMobile 
      ? { top: basePad + 60, bottom: basePad + 50, left: basePad + 20, right: basePad + 20 }
      : { top: basePad + 60, bottom: basePad + 50, left: basePad + 20, right: basePad + 20 };
  }, [isMobile]);

  // ── map:resize — fired on container resize (panel drag) ──────────────────
  useEffect(() => {
    const container = mapContainerRef.current;
    const map = mapRef.current;
    if (!container || !map) return;

    const observer = new ResizeObserver(() => {
      map.resize();
    });
    observer.observe(container);

    const onFit = (e: Event) => {
      const { bounds, padding: extraPad } = (e as CustomEvent).detail;
      const base = extraPad ?? 40;
      map.fitBounds(bounds, { padding: getCameraPadding(base), duration: 800 });
    };
    window.addEventListener('map:fitBounds', onFit);

    return () => {
      observer.disconnect();
      window.removeEventListener('map:fitBounds', onFit);
    };
  }, []);

  // ── Global map:clearAll — fired by runAnalysis() before each new analysis ──────
  // Removes every dynamic layer/source so stale highlights from the previous site
  // don't bleed through while new data is being fetched.
  useEffect(() => {
    const handler = () => {
      const m = mapRef.current;
      if (!m) return;
      const tryRemoveLayer = (id: string) => { try { if (m.getLayer(id)) m.removeLayer(id); } catch (_) { } };
      const tryRemoveSource = (id: string) => { try { if (m.getSource(id)) m.removeSource(id); } catch (_) { } };

      // Demand-mix geo
      ['dm-poly-fill', 'dm-poly-line', 'dm-transit-pulse', 'dm-transit-circle'].forEach(tryRemoveLayer);
      tryRemoveSource('dm-geo-source');

      // Footfall heatmap
      tryRemoveLayer('footfall-heatmap');
      tryRemoveSource('footfall-heat');

      // Competitor / gap
      ['comp-pts-halo', 'comp-pts', 'comp-pts-labels', 'gap-pts-halo', 'gap-pts', 'gap-pts-labels'].forEach(tryRemoveLayer);
      tryRemoveSource('comp-source');
      tryRemoveSource('gap-source');

      // Cannibalization
      ['cann-new-walk-fill', 'cann-new-walk-line', 'cann-new-del-line',
        'cann-out-walk-fill', 'cann-out-walk-line', 'cann-out-del-line', 'cann-out-markers'].forEach(tryRemoveLayer);
      ['cann-new-walk', 'cann-new-del', 'cann-out-walk', 'cann-out-del', 'cann-out-pts'].forEach(tryRemoveSource);
    };
    window.addEventListener('map:clearAll', handler);
    return () => window.removeEventListener('map:clearAll', handler);
  }, []);

  const handleGeoSelect = useCallback((lat: number, lng: number, name: string, geojson?: any) => {
    const map = mapRef.current;
    if (!map) return;

    // Zoom to point
    map.flyTo({ center: [lng, lat], zoom: 15, speed: 1.4, padding: getCameraPadding() });

    // Clean up previous search highlights
    if (searchMarkerRef.current) {
      searchMarkerRef.current.remove();
      searchMarkerRef.current = null;
    }
    if (map.getLayer('search-feature-fill')) map.removeLayer('search-feature-fill');
    if (map.getLayer('search-feature-line')) map.removeLayer('search-feature-line');
    if (map.getSource('search-feature')) map.removeSource('search-feature');

    // If GeoJSON boundary is provided, highlight the feature area!
    if (geojson) {
      map.addSource('search-feature', {
        type: 'geojson',
        data: geojson
      });
      map.addLayer({
        id: 'search-feature-fill',
        type: 'fill',
        source: 'search-feature',
        paint: {
          'fill-color': '#4f9cf9',
          'fill-opacity': 0.2
        }
      });
      map.addLayer({
        id: 'search-feature-line',
        type: 'line',
        source: 'search-feature',
        paint: {
          'line-color': '#4f9cf9',
          'line-width': 3
        }
      });

      // Fit map to the bounding box of the GeoJSON if it's a polygon/multipolygon
      if (geojson.type === 'Polygon' || geojson.type === 'MultiPolygon') {
        try {
          const bbox = turf.bbox(geojson);
          map.fitBounds(bbox as [number, number, number, number], { padding: getCameraPadding(40), speed: 1.2 });
        } catch (e) {
          // Fallback to point flyTo if bbox fails
        }
      }

      // Auto-remove feature highlight after 8 seconds
      setTimeout(() => {
        if (mapRef.current) {
          if (mapRef.current.getLayer('search-feature-fill')) mapRef.current.removeLayer('search-feature-fill');
          if (mapRef.current.getLayer('search-feature-line')) mapRef.current.removeLayer('search-feature-line');
          if (mapRef.current.getSource('search-feature')) mapRef.current.removeSource('search-feature');
        }
      }, 8000);
      return;
    }

    // Fallback: Create a pulsing highlight marker for points
    const el = document.createElement('div');
    el.style.cssText = `
      width: 40px; height: 40px; 
      border-radius: 50%; 
      background: rgba(79, 156, 249, 0.4); 
      border: 2px solid #4f9cf9; 
      animation: search-pulse 1.5s infinite cubic-bezier(0.215, 0.61, 0.355, 1);
      transform-origin: center center;
    `;

    if (!document.getElementById('search-pulse-style')) {
      const style = document.createElement('style');
      style.id = 'search-pulse-style';
      style.innerHTML = `@keyframes search-pulse { 0% { transform: scale(0.1); opacity: 1; } 100% { transform: scale(1.5); opacity: 0; } }`;
      document.head.appendChild(style);
    }

    searchMarkerRef.current = new maplibregl.Marker({ element: el })
      .setLngLat([lng, lat])
      .addTo(map);

    // Auto-remove highlight after 4 seconds
    setTimeout(() => {
      if (searchMarkerRef.current) {
        searchMarkerRef.current.remove();
        searchMarkerRef.current = null;
      }
    }, 4000);
  }, []);

  // Initialize map once
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    // Start with Martin layers hidden so it doesn't fail if the tile server is offline
    const initialMartinLayers = MAP_LAYERS.map(layer => ({
      ...layer,
      layout: { ...layer.layout, visibility: 'none' }
    }));

    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: {
        version: 8 as const,
        sources: {
          ...buildSources(TILE_BASE),
          'osm-raster': {
            type: 'raster',
            tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
            attribution: '© OpenStreetMap contributors', tileSize: 256,
          },
          'satellite': {
            type: 'raster',
            tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],
            attribution: 'Esri World Imagery', tileSize: 256,
          },
          'google-hybrid': {
            type: 'raster',
            tiles: [
              'https://mt0.google.com/vt/lyrs=y&x={x}&y={y}&z={z}',
              'https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}',
              'https://mt2.google.com/vt/lyrs=y&x={x}&y={y}&z={z}',
              'https://mt3.google.com/vt/lyrs=y&x={x}&y={y}&z={z}',
            ],
            attribution: '© Google', tileSize: 256,
          }
        },
        layers: [
          // Base rasters placed at the very bottom
          {
            id: 'osm-layer',
            type: 'raster',
            source: 'osm-raster',
            layout: { visibility: 'visible' },
            paint: { 'raster-opacity': 1 }
          },
          {
            id: 'satellite-layer',
            type: 'raster',
            source: 'satellite',
            layout: { visibility: 'none' },
            paint: { 'raster-opacity': 1 }
          },
          {
            id: 'google-hybrid-layer',
            type: 'raster',
            source: 'google-hybrid',
            layout: { visibility: 'none' },
            paint: { 'raster-opacity': 1 }
          },
          ...initialMartinLayers as any
        ],
      },
      center: [80.2270, 13.0350],
      zoom: 11,
      attributionControl: false,
    });

    mapRef.current = map;

    // Eagerly register all custom pins once the style is ready — eliminates the
    // one-frame flash where symbols render before their images arrive.
    map.on('load', () => {
      registerPinImages(map);
      applyMapMode('osm');
      // Apply panel padding immediately on load so the very first camera op is correct
      const raw = getComputedStyle(document.documentElement).getPropertyValue('--panel-h').trim();
      const panelH = parseFloat(raw) || 0;
      if (panelH > 0) map.setPadding({ top: 0, bottom: panelH, left: 0, right: 0 });

      // ── Available-data boundary (Chennai OSM extract) ─────────────
      // Highlighted box marking where analysis actually has data; outside it, queries return empty.
      const COVERAGE = { w: 80.08, s: 12.85, e: 80.32, n: 13.18 };
      const coverageFeature = {
        type: 'Feature',
        properties: {},
        geometry: {
          type: 'Polygon',
          coordinates: [[
            [COVERAGE.w, COVERAGE.s],
            [COVERAGE.e, COVERAGE.s],
            [COVERAGE.e, COVERAGE.n],
            [COVERAGE.w, COVERAGE.n],
            [COVERAGE.w, COVERAGE.s],
          ]],
        },
      } as any;
      if (!map.getSource('analysis-coverage')) {
        map.addSource('analysis-coverage', { type: 'geojson', data: coverageFeature });
        // subtle wash inside the available area
        map.addLayer({
          id: 'analysis-coverage-fill',
          type: 'fill',
          source: 'analysis-coverage',
          paint: { 'fill-color': '#ffa657', 'fill-opacity': 0.06 },
        });
        // soft glow under the outline so the box reads as a highlight
        map.addLayer({
          id: 'analysis-coverage-glow',
          type: 'line',
          source: 'analysis-coverage',
          layout: { 'line-join': 'round' },
          paint: { 'line-color': '#ffa657', 'line-width': 7, 'line-opacity': 0.18, 'line-blur': 4 },
        });
        // bright dashed outline on top
        map.addLayer({
          id: 'analysis-coverage-line',
          type: 'line',
          source: 'analysis-coverage',
          layout: { 'line-join': 'round' },
          paint: {
            'line-color': '#ffa657',
            'line-width': 2.5,
            'line-dasharray': [2, 1.5],
            'line-opacity': 0.95,
          },
        });
      }
    });

    // Fallback: if a layer references a pin that somehow isn't loaded yet, add it now.
    map.on('styleimagemissing', (e) => {
      const id = e.id;
      const svg = PIN_SVGS[id];
      if (!svg) return;
      const img = new Image(32, 44);
      img.onload = () => { if (!map.hasImage(id)) map.addImage(id, img, { pixelRatio: 2 }); };
      img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
    });

    // Disable double click zoom when drawing
    map.doubleClickZoom.disable();


    // Initialize Draw
    const draw = new MapboxDraw({
      displayControlsDefault: false,
      controls: { polygon: false, trash: false },
      styles: [
        {
          'id': 'gl-draw-polygon-fill-inactive',
          'type': 'fill',
          'filter': ['all', ['==', 'active', 'false'], ['==', '$type', 'Polygon']],
          'paint': { 'fill-color': '#4f9cf9', 'fill-opacity': 0.1 }
        },
        {
          'id': 'gl-draw-polygon-fill-active',
          'type': 'fill',
          'filter': ['all', ['==', 'active', 'true'], ['==', '$type', 'Polygon']],
          'paint': { 'fill-color': '#00f3ff', 'fill-opacity': 0.2 }
        },
        {
          'id': 'gl-draw-polygon-stroke-inactive',
          'type': 'line',
          'filter': ['all', ['==', 'active', 'false'], ['==', '$type', 'Polygon']],
          'layout': { 'line-cap': 'round', 'line-join': 'round' },
          'paint': { 'line-color': '#4f9cf9', 'line-width': 2, 'line-dasharray': [2, 2] }
        },
        {
          'id': 'gl-draw-polygon-stroke-active',
          'type': 'line',
          'filter': ['all', ['==', 'active', 'true'], ['==', '$type', 'Polygon']],
          'layout': { 'line-cap': 'round', 'line-join': 'round' },
          'paint': { 'line-color': '#00f3ff', 'line-width': 3, 'line-offset': 0 }
        },
        {
          'id': 'gl-draw-polygon-and-line-vertex-stroke-inactive',
          'type': 'circle',
          'filter': ['all', ['==', 'meta', 'vertex'], ['==', '$type', 'Point']],
          'paint': { 'circle-radius': 7, 'circle-color': '#fff' }
        },
        {
          'id': 'gl-draw-polygon-and-line-vertex-inactive',
          'type': 'circle',
          'filter': ['all', ['==', 'meta', 'vertex'], ['==', '$type', 'Point']],
          'paint': { 'circle-radius': 5, 'circle-color': '#00f3ff' }
        },
        {
          'id': 'gl-draw-point-active',
          'type': 'circle',
          'filter': ['all', ['==', '$type', 'Point'], ['==', 'active', 'true']],
          'paint': { 'circle-radius': 9, 'circle-color': '#fff' }
        },
        {
          'id': 'gl-draw-point-active-inner',
          'type': 'circle',
          'filter': ['all', ['==', '$type', 'Point'], ['==', 'active', 'true']],
          'paint': { 'circle-radius': 6, 'circle-color': '#00f3ff' }
        }
      ]
    });
    drawRef.current = draw;
    map.addControl(draw as any, "top-right");

    // MapboxDraw events - Update drawn polygon for context
    const onDrawUpdate = () => {
      const data = draw.getAll();
      const poly = data.features.find(f => f.geometry.type === 'Polygon');
      // Clear stale visualizations whenever the polygon changes
      window.dispatchEvent(new Event('map:clearAll'));
      setDrawnPolygon(poly || null);
    };

    map.on('draw.create', onDrawUpdate);
    map.on('draw.update', onDrawUpdate);
    map.on('draw.delete', onDrawUpdate);

    return () => {
      map.remove();
      mapRef.current = null;
    }
  }, []);

  // ── Handle Selected POI Highlight ───────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !selectedPoi) return;

    // Remove previous highlight
    if (selectedPoiMarkerRef.current) {
      selectedPoiMarkerRef.current.remove();
    }

    // Fly to the POI
    map.flyTo({
      center: [selectedPoi.lng, selectedPoi.lat],
      zoom: 17,
      speed: 1.2,
      essential: true,
      padding: getCameraPadding()
    });

    // Create a pulse marker
    const el = document.createElement('div');
    el.className = 'poi-highlight-marker';
    el.innerHTML = `
      <div style="position:relative; width:30px; height:30px; display:flex; align-items:center; justifyContent:center;">
        <div style="position:absolute; width:100%; height:100%; background:var(--accent); border-radius:50%; opacity:0.4; animation: ffPulse 1.5s infinite;"></div>
        <div style="width:12px; height:12px; background:var(--accent); border:2px solid white; border-radius:50%; box-shadow:0 0 10px var(--accent); z-index:1;"></div>
      </div>
    `;

    selectedPoiMarkerRef.current = new maplibregl.Marker(el)
      .setLngLat([selectedPoi.lng, selectedPoi.lat])
      .addTo(map);

    return () => {
      if (selectedPoiMarkerRef.current) selectedPoiMarkerRef.current.remove();
    };
  }, [selectedPoi]);

  // ── Cleanup on Analysis Change ───────────────────────────
  useEffect(() => {
    if (selectedPoiMarkerRef.current) {
      selectedPoiMarkerRef.current.remove();
      selectedPoiMarkerRef.current = null;
    }
  }, [analysisData]);

  // ── Competitor: Navigate to clicked competitor on map ─────
  useEffect(() => {
    const map = mapRef.current;
    const handler = (e: Event) => {
      if (!map) return;
      const { lng, lat } = (e as CustomEvent).detail;
      map.flyTo({ center: [lng, lat], zoom: 17, speed: 1.2, essential: true, padding: getCameraPadding() });

      // Place orange competitor marker
      if (selectedPoiMarkerRef.current) selectedPoiMarkerRef.current.remove();
      const el = document.createElement('div');
      el.innerHTML = `
        <div style="position:relative;width:30px;height:30px;display:flex;align-items:center;justify-content:center;">
          <div style="position:absolute;width:100%;height:100%;background:#ffa657;border-radius:50%;opacity:0.35;animation:ffPulse 1.5s infinite;"></div>
          <div style="width:12px;height:12px;background:#ffa657;border:2px solid white;border-radius:50%;box-shadow:0 0 10px #ffa657;z-index:1;"></div>
        </div>`;
      selectedPoiMarkerRef.current = new maplibregl.Marker(el)
        .setLngLat([lng, lat])
        .addTo(map);
    };
    window.addEventListener('competitor:navigate', handler);
    return () => window.removeEventListener('competitor:navigate', handler);
  }, []);



  // ── NDVI PNG overlay ───────────────────────────────────────────────────
  // When the NDVI snapshot result arrives, overlay the colourised PNG on the map
  // aligned to the drawn polygon's bounding box.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ndviData?.preview_png_base64 || !drawnPolygon) {
      // Clear overlay if polygon was deleted
      if (map?.getLayer('ndvi-overlay-layer')) {
        map.removeLayer('ndvi-overlay-layer');
        map.removeSource('ndvi-overlay');
      }
      return;
    }

    const bbox = turf.bbox(drawnPolygon);           // [minLng, minLat, maxLng, maxLat]
    const imgSrc = `data:image/png;base64,${ndviData.preview_png_base64}`;

    // Wait for map style to be loaded before adding sources/layers
    const addOverlay = () => {
      if (map.getSource('ndvi-overlay')) {
        // Already exists — just update the image (re-scan)
        (map.getSource('ndvi-overlay') as maplibregl.ImageSource).updateImage({ url: imgSrc });
      } else {
        map.addSource('ndvi-overlay', {
          type: 'image',
          url: imgSrc,
          coordinates: [
            [bbox[0], bbox[3]],  // top-left
            [bbox[2], bbox[3]],  // top-right
            [bbox[2], bbox[1]],  // bottom-right
            [bbox[0], bbox[1]],  // bottom-left
          ],
        });
        map.addLayer({
          id: 'ndvi-overlay-layer',
          type: 'raster',
          source: 'ndvi-overlay',
          paint: { 'raster-opacity': 0.75 },
        });
      }
    };

    if (map.isStyleLoaded()) {
      addOverlay();
    } else {
      map.once('load', addOverlay);
    }
  }, [ndviData, drawnPolygon]);

  // ── Cannibalization Circles ────────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const LAYERS = ['cann-new-walk-fill', 'cann-new-walk-line', 'cann-new-del-line',
      'cann-out-del-line', 'cann-out-walk-fill', 'cann-out-walk-line', 'cann-out-markers'];
    const SOURCES = ['cann-new-walk', 'cann-new-del', 'cann-out-del', 'cann-out-walk', 'cann-out-pts'];

    const cleanup = () => {
      LAYERS.forEach(id => { try { if (map.getLayer(id)) map.removeLayer(id); } catch (_) { } });
      SOURCES.forEach(id => { try { if (map.getSource(id)) map.removeSource(id); } catch (_) { } });
    };

    cleanup();
    if (activeTab !== 'cannibalization' || !sitePin) return;

    const styleReady = () => { try { return !!map.getStyle()?.layers; } catch { return false; } };

    // Build a lookup: outlet name → analysis result (for popup tooltips)
    const resultMap: Record<string, { walk: number; delivery: number; dist: number }> = {};
    (cannibalizationData?.results ?? []).forEach(r => {
      resultMap[r.name] = {
        walk: Number(r.walk_overlap_pct) || 0,
        delivery: Number(r.delivery_overlap_pct) || 0,
        dist: Number(r.distance_m) || 0,
      };
    });

    const apply = () => {
      cleanup();

      // ── New site circles ─────────────────────────────────────────────────
      const newWalk = turf.circle([sitePin.lng, sitePin.lat], 0.5, { steps: 80 });
      const newDel = turf.circle([sitePin.lng, sitePin.lat], 3.0, { steps: 80 });

      map.addSource('cann-new-walk', { type: 'geojson', data: newWalk });
      map.addSource('cann-new-del', { type: 'geojson', data: newDel });

      // Walk zone — bold indigo fill + solid stroke
      map.addLayer({
        id: 'cann-new-walk-fill', type: 'fill', source: 'cann-new-walk',
        paint: { 'fill-color': '#6366f1', 'fill-opacity': 0.14 }
      });
      map.addLayer({
        id: 'cann-new-walk-line', type: 'line', source: 'cann-new-walk',
        paint: { 'line-color': '#6366f1', 'line-width': 4, 'line-opacity': 1.0 }
      });

      // Delivery zone — thick amber dashed
      map.addLayer({
        id: 'cann-new-del-line', type: 'line', source: 'cann-new-del',
        paint: { 'line-color': '#f59e0b', 'line-width': 3.5, 'line-dasharray': [6, 4], 'line-opacity': 0.95 }
      });

      // ── Existing outlet circles ──────────────────────────────────────────
      if (existingOutlets.length > 0) {
        const outWalkFc: GeoJSON.FeatureCollection = {
          type: 'FeatureCollection',
          features: existingOutlets.map(o =>
            // embed outlet name so the walk circle fill can be identified
            ({ ...turf.circle([o.lng, o.lat], 0.5, { steps: 80 }), properties: { name: o.name } })
          ),
        };

        // Pin features with full overlap data for popup
        const outPtsFc: GeoJSON.FeatureCollection = {
          type: 'FeatureCollection',
          features: existingOutlets.map(o => {
            const res = resultMap[o.name];
            return {
              type: 'Feature' as const,
              geometry: { type: 'Point' as const, coordinates: [o.lng, o.lat] },
              properties: {
                name: o.name,
                walk: res?.walk ?? null,
                delivery: res?.delivery ?? null,
                dist: res?.dist ?? null,
              },
            };
          }),
        };

        const outDelFc: GeoJSON.FeatureCollection = {
          type: 'FeatureCollection',
          features: existingOutlets.map(o =>
            ({ ...turf.circle([o.lng, o.lat], 3.0, { steps: 80 }), properties: { name: o.name } })
          ),
        };

        map.addSource('cann-out-walk', { type: 'geojson', data: outWalkFc });
        map.addSource('cann-out-del', { type: 'geojson', data: outDelFc });
        map.addSource('cann-out-pts', { type: 'geojson', data: outPtsFc });

        // Delivery zone — purple dashed (distinct from new-site amber delivery)
        map.addLayer({
          id: 'cann-out-del-line', type: 'line', source: 'cann-out-del',
          paint: { 'line-color': '#a855f7', 'line-width': 2, 'line-dasharray': [4, 4], 'line-opacity': 0.85 }
        });

        // Walk zone — bold red fill + solid stroke (rendered on top of delivery)
        map.addLayer({
          id: 'cann-out-walk-fill', type: 'fill', source: 'cann-out-walk',
          paint: { 'fill-color': '#ef4444', 'fill-opacity': 0.12 }
        });
        map.addLayer({
          id: 'cann-out-walk-line', type: 'line', source: 'cann-out-walk',
          paint: { 'line-color': '#ef4444', 'line-width': 3.5, 'line-opacity': 1.0 }
        });

        // Outlet pin markiiiiilarger, with name label)
        map.addLayer({
          id: 'cann-out-markers', type: 'symbol', source: 'cann-out-pts',
          layout: {
            'icon-image': 'pin-osm',
            'icon-size': 1.0,
            'icon-anchor': 'bottom',
            'icon-allow-overlap': true,
            'icon-ignore-placement': true,
            'text-field': ['get', 'name'],
            'text-font': ['Noto Sans Bold'],
            'text-size': 11,
            'text-anchor': 'top',
            'text-offset': [0, 0.4],
            'text-optional': true,
            'text-max-width': 10,
          },
          paint: {
            'text-color': '#e6edf3',
            'text-halo-color': 'rgba(13,17,23,0.95)',
            'text-halo-width': 2,
          },
        });

        // ── Popup on outlet pin click ──────────────────────────────────────
        const onOutletClick = (e: any) => {
          if (!e.features?.length) return;
          const p = e.features[0].properties;
          const walk = p.walk != null ? p.walk : '—';
          const del = p.delivery != null ? p.delivery : '—';
          const dist = p.dist != null ? `${Math.round(p.dist)} m` : '—';

          const riskColor = (pct: number | string, thr1: number, thr2: number) => {
            const n = Number(pct);
            if (isNaN(n)) return '#8b949e';
            return n > thr1 ? '#ff7b72' : n > thr2 ? '#ffa657' : '#7ee787';
          };
          const wColor = riskColor(walk, 30, 10);
          const dColor = riskColor(del, 60, 30);

          mapPopupRef.current?.remove();
          mapPopupRef.current = new maplibregl.Popup({
            closeButton: true, closeOnClick: false, maxWidth: '240px',
            className: 'map-info-popup',
          })
            .setLngLat(e.features[0].geometry.coordinates)
            .setHTML(`
            <div style="font:500 13px/1.4 system-ui,sans-serif;color:#e6edf3;min-width:200px">
              <div style="font-weight:800;font-size:14px;margin-bottom:10px">${p.name}</div>
              <div style="display:flex;flex-direction:column;gap:8px">
                <div style="display:flex;justify-content:space-between;align-items:center;padding:6px 10px;background:rgba(255,255,255,0.05);border-radius:8px">
                  <span style="font-size:11px;color:#aaa">Distance</span>
                  <span style="font-weight:700">${dist}</span>
                </div>
                <div style="display:flex;justify-content:space-between;align-items:center;padding:6px 10px;background:${wColor}12;border:1px solid ${wColor}30;border-radius:8px">
                  <div>
                    <div style="font-size:10px;color:#aaa;margin-bottom:1px">Walk overlap (500 m)</div>
                    <div style="font-size:9px;color:${wColor}">${Number(walk) > 30 ? '⚠ High risk' : Number(walk) > 10 ? 'Moderate' : 'Safe'}</div>
                  </div>
                  <span style="font-size:18px;font-weight:900;color:${wColor}">${walk}%</span>
                </div>
                <div style="display:flex;justify-content:space-between;align-items:center;padding:6px 10px;background:${dColor}12;border:1px solid ${dColor}30;border-radius:8px">
                  <div>
                    <div style="font-size:10px;color:#aaa;margin-bottom:1px">Delivery overlap (3 km)</div>
                    <div style="font-size:9px;color:${dColor}">${Number(del) > 60 ? '⚠ High risk' : Number(del) > 30 ? 'Moderate' : 'Safe'}</div>
                  </div>
                  <span style="font-size:18px;font-weight:900;color:${dColor}">${del}%</span>
                </div>
              </div>
            </div>`)
            .addTo(map);
        };

        const onEnter = () => { map.getCanvas().style.cursor = 'pointer'; };
        const onLeave = () => { map.getCanvas().style.cursor = ''; };

        map.on('click', 'cann-out-markers', onOutletClick);
        map.on('mouseenter', 'cann-out-markers', onEnter);
        map.on('mouseleave', 'cann-out-markers', onLeave);

        // Store cleanup for these handlers in the effect return
        (map as any).__cannHandlers = { onOutletClick, onEnter, onLeave };
      }

      // Auto-zoom only after analysis results arrive
      if (cannibalizationData?.results?.length && existingOutlets.length > 0) {
        try {
          const pts = [sitePin, ...existingOutlets].map(p => [p.lng, p.lat] as [number, number]);
          const bbox = turf.bbox(turf.featureCollection(pts.map(p => turf.point(p)))) as [number, number, number, number];
          map.fitBounds(bbox, { padding: getCameraPadding(20), duration: 800 });
        } catch (_) { }
      }
    };

    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    const scheduleApply = () => {
      if (!mapRef.current) return;
      if (styleReady()) { apply(); }
      else { retryTimer = setTimeout(scheduleApply, 50); }
    };
    scheduleApply();

    return () => {
      if (retryTimer) clearTimeout(retryTimer);
      // Remove popup event handlers
      const h = (map as any).__cannHandlers;
      if (h) {
        try { map.off('click', 'cann-out-markers', h.onOutletClick); } catch (_) { }
        try { map.off('mouseenter', 'cann-out-markers', h.onEnter); } catch (_) { }
        try { map.off('mouseleave', 'cann-out-markers', h.onLeave); } catch (_) { }
        delete (map as any).__cannHandlers;
      }
      mapPopupRef.current?.remove();
      cleanup();
    };
  }, [activeTab, sitePin, existingOutlets, cannibalizationData]);

  // ── Demand-Mix Zone Layers — Effect A: fetch once per analysis ────────────
  // Deps: demandMixData + sitePin (NOT activeTab).
  // This means the geo fetch only runs when Analyse is clicked and returns data —
  // NOT on every tab switch. Layers are added hidden; Effect B shows/hides them.
  useEffect(() => {
    const SRC = 'dm-geo-source';
    const LAYERS = ['dm-poly-fill', 'dm-poly-line', 'dm-transit-pulse', 'dm-transit-circle'];

    const cleanup = () => {
      const m = mapRef.current;
      if (!m) return;
      LAYERS.forEach(id => { try { if (m.getLayer(id)) m.removeLayer(id); } catch (_) { } });
      try { if (m.getSource(SRC)) m.removeSource(SRC); } catch (_) { }
    };

    cleanup();
    // Guard: only proceed when analysis has run and produced site coordinates.
    if (!demandMixData?.site?.lat || !demandMixData?.site?.lng) return;

    let cancelled = false;

    const apply = async () => {
      try {
        // Use coords from demandMixData.site (the site at analysis time), NOT sitePin.
        // sitePin can change when the user places a new pin without clicking Analyse.
        const { lat: geoLat, lng: geoLng } = demandMixData!.site;
        const res = await fetch(
          `${API_BASE}/api/demand-mix-geo?lat=${geoLat}&lng=${geoLng}&radius=500`
        );
        if (cancelled) return;
        if (!res.ok) { console.error('[DemandMixGeo] HTTP', res.status, await res.text()); return; }

        const fc = await res.json();
        if (cancelled) return;
        console.log(`[DemandMixGeo] ${fc.features?.length ?? 0} features`);

        const m = mapRef.current;
        if (!m) return;
        const styleReady = () => { try { return !!m.getStyle()?.layers; } catch { return false; } };
        if (!styleReady()) return;

        cleanup();
        m.addSource(SRC, { type: 'geojson', data: fc });

        // Start hidden — Effect B will show them if the user is on demand-mix tab
        const onDemandMix = activeTabRef.current === 'demand-mix';

        m.addLayer({
          id: 'dm-poly-fill', type: 'fill', source: SRC,
          layout: { visibility: onDemandMix ? 'visible' : 'none' },
          filter: ['!=', ['get', 'zone_type'], 'transit'],
          paint: {
            'fill-color': ['match', ['get', 'zone_type'],
              'office', '#3b82f6', 'residential', '#22c55e', 'college', '#f97316', '#aaaaaa'],
            'fill-opacity': 0.55,
          },
        });

        m.addLayer({
          id: 'dm-poly-line', type: 'line', source: SRC,
          layout: { visibility: onDemandMix ? 'visible' : 'none' },
          filter: ['!=', ['get', 'zone_type'], 'transit'],
          paint: {
            'line-color': ['match', ['get', 'zone_type'],
              'office', '#2563eb', 'residential', '#16a34a', 'college', '#ea580c', '#888888'],
            'line-opacity': 1.0,
            'line-width': 1.8,
          },
        });

        m.addLayer({
          id: 'dm-transit-pulse', type: 'circle', source: SRC,
          layout: { visibility: onDemandMix ? 'visible' : 'none' },
          filter: ['==', ['get', 'zone_type'], 'transit'],
          paint: { 'circle-color': '#818cf8', 'circle-radius': 12, 'circle-opacity': 0.18 },
        });

        // Transit pin symbol — register the image before adding the layer
        if (!m.hasImage('pin-transit')) {
          const img = new Image(32, 42);
          img.onload = () => { if (!m.hasImage('pin-transit')) m.addImage('pin-transit', img, { pixelRatio: 2 }); };
          img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(PIN_SVGS['pin-transit']);
        }

        m.addLayer({
          id: 'dm-transit-circle', type: 'symbol', source: SRC,
          layout: {
            visibility: onDemandMix ? 'visible' : 'none',
            'icon-image': 'pin-transit',
            'icon-size': 1.1,
            'icon-anchor': 'bottom',
            'icon-allow-overlap': true,
            'icon-ignore-placement': true,
          },
          filter: ['==', ['get', 'zone_type'], 'transit'],
        });
      } catch (e) {
        console.error('[DemandMixGeo] layer error:', e);
      }
    };

    const styleReady = () => { try { return !!mapRef.current?.getStyle()?.layers; } catch { return false; } };
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    const scheduleApply = () => {
      if (cancelled || !mapRef.current) return;
      if (styleReady()) apply();
      else retryTimer = setTimeout(scheduleApply, 50);
    };
    scheduleApply();

    return () => { cancelled = true; if (retryTimer) clearTimeout(retryTimer); cleanup(); };
    // Depend on demandMixData.site coords — only changes when Analyse is clicked.
    // Deliberately excludes sitePin so pin placement never triggers a geo fetch.
  }, [demandMixData?.site?.lat, demandMixData?.site?.lng]);

  // ── Demand-Mix Zone Layers — Effect B: show/hide on tab switch ─────────────
  // No fetch — just toggles visibility of already-added layers.
  useEffect(() => {
    const m = mapRef.current;
    if (!m) return;
    const LAYERS = ['dm-poly-fill', 'dm-poly-line', 'dm-transit-pulse', 'dm-transit-circle'];
    const show = activeTab === 'demand-mix';
    LAYERS.forEach(id => {
      try { if (m.getLayer(id)) m.setLayoutProperty(id, 'visibility', show ? 'visible' : 'none'); } catch (_) { }
    });
  }, [activeTab]);

  // ── Footfall Heatmap Layer ──────────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const showHeatmap = activeTab === 'footfall';
    if (map.getLayer('footfall-heatmap')) {
      map.setLayoutProperty('footfall-heatmap', 'visibility', showHeatmap ? 'visible' : 'none');
    }
    if (!showHeatmap) return;

    const HEAT_SOURCE = 'footfall-heat';
    const HEAT_LAYER = 'footfall-heatmap';

    // Color ramps tuned per base map so the heatmap always reads clearly
    const heatColor = (mode: MapMode) => {
      if (mode === 'osm') {
        // Light tiles — warm ramp, pulled back so the darkest stop stays readable
        return [
          'interpolate', ['linear'], ['heatmap-density'],
          0, 'rgba(0,0,0,0)',
          0.05, 'rgba(255,240,120,0.45)',
          0.25, 'rgba(255,190,30,0.65)',
          0.5, 'rgba(255,110,20,0.76)',
          0.75, 'rgba(220,50,10,0.84)',
          1.0, 'rgba(180,30,10,0.9)',
        ];
      }
      if (mode === 'satellite' || mode === 'hybrid') {
        // Dark aerial — infrared palette, slightly softened
        return [
          'interpolate', ['linear'], ['heatmap-density'],
          0, 'rgba(0,0,0,0)',
          0.05, 'rgba(0,120,255,0.45)',
          0.25, 'rgba(0,220,200,0.65)',
          0.5, 'rgba(255,220,0,0.78)',
          0.75, 'rgba(255,100,20,0.87)',
          1.0, 'rgba(255,240,240,0.95)',
        ];
      }
      // Martin (dark vector) — purple-amber, softened peaks
      return [
        'interpolate', ['linear'], ['heatmap-density'],
        0, 'rgba(0,0,0,0)',
        0.05, 'rgba(90,40,170,0.45)',
        0.25, 'rgba(160,60,240,0.65)',
        0.5, 'rgba(251,191,36,0.78)',
        0.75, 'rgba(251,113,44,0.87)',
        1.0, 'rgba(255,255,255,1)',
      ];
    };

    const cleanup = () => {
      if (!mapRef.current) return;
      try {
        if (map.getLayer(HEAT_LAYER)) map.removeLayer(HEAT_LAYER);
        if (map.getSource(HEAT_SOURCE)) map.removeSource(HEAT_SOURCE);
      } catch (_) { }
    };

    const apply = () => {
      // If only the map mode changed and the layer exists, just swap the color ramp
      if (map.getLayer(HEAT_LAYER)) {
        map.setPaintProperty(HEAT_LAYER, 'heatmap-color', heatColor(mapMode));
        return;
      }

      cleanup();

      const points = analysisData?.footfall?.heatmap_points
        ?? analysisData?.footfall?.breakdown?.flatMap((c: any) => c.heatmapPoints ?? []);
      if (!points?.length) return;

      const geojson: GeoJSON.FeatureCollection = {
        type: 'FeatureCollection',
        features: points.map(p => ({
          type: 'Feature' as const,
          geometry: { type: 'Point' as const, coordinates: [p.lng, p.lat] },
          properties: { weight: p.weight },
        })),
      };

      try { map.addSource(HEAT_SOURCE, { type: 'geojson', data: geojson }); }
      catch (e) { console.error('[Heatmap] addSource failed:', e); return; }

      try {
        map.addLayer({
          id: HEAT_LAYER,
          type: 'heatmap',
          source: HEAT_SOURCE,
          maxzoom: 16,
          paint: {
            'heatmap-weight': ['interpolate', ['linear'], ['get', 'weight'], 0, 0, 1, 1],
            'heatmap-intensity': ['interpolate', ['linear'], ['zoom'], 9, 1, 13, 4, 15, 7],
            'heatmap-color': heatColor(mapMode),
            'heatmap-radius': ['interpolate', ['linear'], ['zoom'], 9, 20, 12, 35, 15, 55],
            'heatmap-opacity': ['interpolate', ['linear'], ['zoom'], 10, 0.85, 14, 0.75, 15, 0.4],
          },
        });
      } catch (e) { console.error('[Heatmap] addLayer failed:', e); }
    };

    const styleReady = () => { try { return !!map.getStyle()?.layers; } catch { return false; } };

    if (styleReady()) {
      apply();
    } else {
      let applied = false;
      const onStyleData = () => {
        if (applied || !styleReady()) return;
        applied = true;
        map.off('styledata', onStyleData);
        apply();
      };
      map.on('styledata', onStyleData);
      return () => { map.off('styledata', onStyleData); cleanup(); };
    }

    return cleanup;
  }, [analysisData, activeTab, mapMode]);


  // ── Competitor & Gaps Layers ────────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const COMP_SOURCE = 'comp-source';
    const GAP_SOURCE = 'gap-source';

    const cleanup = () => {
      if (!mapRef.current) return;
      try {
        ['comp-pts-halo', 'comp-pts', 'comp-pts-labels',
          'gap-pts-halo', 'gap-pts', 'gap-pts-labels'].forEach(id => {
            if (map.getLayer(id)) map.removeLayer(id);
          });
        if (map.getSource(COMP_SOURCE)) map.removeSource(COMP_SOURCE);
        if (map.getSource(GAP_SOURCE)) map.removeSource(GAP_SOURCE);
      } catch (_) { }
    };

    const addLayers = () => {
      cleanup();

      const onCompetitorTab = activeTab === 'competitor';
      const showComps = onCompetitorTab && !!competitorData?.list?.length;
      const showGaps = onCompetitorTab && !!opportunityData?.gaps?.length;

      // ── Competitors ──────────────────────────────────────────────────────
      if (showComps && competitorData?.list?.length) {
        const fc: GeoJSON.FeatureCollection = {
          type: 'FeatureCollection',
          features: competitorData.list.map(c => ({
            type: 'Feature',
            geometry: { type: 'Point', coordinates: [c.lng, c.lat] },
            properties: {
              name: c.name,
              source: c.source || 'osm',
              barrier: c.has_barrier ? 1 : 0,
              rating: c.rating ?? 0,
              raw: JSON.stringify(c),
            },
          })),
        };
        map.addSource(COMP_SOURCE, { type: 'geojson', data: fc });

        // Outer glow ring
        map.addLayer({
          id: 'comp-pts-halo', type: 'circle', source: COMP_SOURCE,
          paint: {
            'circle-color': ['match', ['get', 'source'], 'google', '#4f9cf9', 'osm+google', '#3fb950', '#ffa657'],
            'circle-radius': ['match', ['get', 'source'], 'google', 16, 'osm+google', 16, 14],
            'circle-opacity': 0.22,
            'circle-stroke-width': 0,
          },
        });

        // Colored pin icons per source
        map.addLayer({
          id: 'comp-pts', type: 'symbol', source: COMP_SOURCE,
          layout: {
            'icon-image': ['match', ['get', 'source'], 'google', 'pin-google', 'osm+google', 'pin-osm-google', 'pin-osm'],
            'icon-size': 0.85,
            'icon-anchor': 'bottom',
            'icon-allow-overlap': true,
            'icon-ignore-placement': true,
          },
        });

        // Name labels above zoom 14
        map.addLayer({
          id: 'comp-pts-labels', type: 'symbol', source: COMP_SOURCE,
          minzoom: 14,
          layout: {
            'text-field': ['get', 'name'],
            'text-font': ['Noto Sans Bold'],
            'text-size': 11,
            'text-offset': [0, 0.4],
            'text-anchor': 'top',
            'text-optional': true,
            'text-max-width': 10,
            'text-allow-overlap': false,
          },
          paint: {
            'text-color': '#e6edf3',
            'text-halo-color': 'rgba(13,17,23,0.95)',
            'text-halo-width': 2,
          },
        });
      }

      // ── Opportunity Gaps ─────────────────────────────────────────────────
      if (showGaps && opportunityData?.gaps?.length) {
        const fc: GeoJSON.FeatureCollection = {
          type: 'FeatureCollection',
          features: opportunityData.gaps.map(g => ({
            type: 'Feature',
            geometry: { type: 'Point', coordinates: [g.lng, g.lat] },
            properties: {
              name: g.name,
              source_type: g.source_type,
              icon: g.source_icon || '📍',
              raw: JSON.stringify(g),
            },
          })),
        };
        map.addSource(GAP_SOURCE, { type: 'geojson', data: fc });

        // Outer glow ring
        map.addLayer({
          id: 'gap-pts-halo', type: 'circle', source: GAP_SOURCE,
          paint: {
            'circle-color': '#7ee787',
            'circle-radius': 20,
            'circle-opacity': 0.18,
            'circle-stroke-width': 0,
          },
        });

        // Diamond pin icon
        map.addLayer({
          id: 'gap-pts', type: 'symbol', source: GAP_SOURCE,
          layout: {
            'icon-image': 'pin-gap',
            'icon-size': 0.9,
            'icon-anchor': 'bottom',
            'icon-allow-overlap': true,
            'icon-ignore-placement': true,
          },
        });

        // Gap label
        map.addLayer({
          id: 'gap-pts-labels', type: 'symbol', source: GAP_SOURCE,
          minzoom: 13,
          layout: {
            'text-field': ['get', 'name'],
            'text-font': ['Noto Sans Bold'],
            'text-size': 11,
            'text-offset': [0, 0.4],
            'text-anchor': 'top',
            'text-optional': true,
            'text-max-width': 10,
            'text-allow-overlap': false,
          },
          paint: {
            'text-color': '#7ee787',
            'text-halo-color': 'rgba(13,17,23,0.95)',
            'text-halo-width': 2.5,
          },
        });
      }
    };

    const apply = () => {
      registerPinImages(map);
      addLayers();
    };

    // Use getStyle() to check if the style is parsed and ready for layer/source
    // additions — unlike isStyleLoaded() this does NOT wait for tiles to render,
    // so it returns true immediately even during fitBounds animations.
    const styleReady = () => { try { return !!map.getStyle()?.layers; } catch { return false; } };

    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    const scheduleApply = () => {
      if (!mapRef.current) return;
      if (styleReady()) { apply(); }
      else { retryTimer = setTimeout(scheduleApply, 50); }
    };
    scheduleApply();

    // ── Map interaction handlers ──────────────────────────────────────────
    const closePopup = () => { mapPopupRef.current?.remove(); mapPopupRef.current = null; };

    const showPopup = (lngLat: [number, number], html: string) => {
      closePopup();
      mapPopupRef.current = new maplibregl.Popup({
        closeButton: true, closeOnClick: false, maxWidth: '240px',
        className: 'map-info-popup',
      }).setLngLat(lngLat).setHTML(html).addTo(map);
    };

    const onCompClick = (e: any) => {
      if (!e.features?.length) return;
      const c = JSON.parse(e.features[0].properties.raw);
      const srcColor = c.source === 'google' ? '#4f9cf9' : c.source === 'osm+google' ? '#3fb950' : '#ffa657';
      const srcLabel = c.source === 'google' ? 'Google Places' : c.source === 'osm+google' ? 'Google + OSM' : 'OpenStreetMap';
      const srcDesc = c.source === 'google' ? 'Verified Google listing' : c.source === 'osm+google' ? 'Enriched with both sources' : 'Community OSM data';
      showPopup([c.lng, c.lat], `
        <div style="font:500 13px/1.4 system-ui,sans-serif;color:#e6edf3;min-width:200px">
          <div style="font-weight:800;margin-bottom:8px;font-size:14px;line-height:1.3">${c.name}</div>
          <div style="display:flex;align-items:center;gap:6px;margin-bottom:10px;padding:6px 8px;background:${srcColor}12;border:1px solid ${srcColor}30;border-radius:8px">
            <div style="width:8px;height:8px;border-radius:50%;background:${srcColor};flex-shrink:0"></div>
            <div>
              <div style="font-size:10px;font-weight:700;color:${srcColor}">${srcLabel}</div>
              <div style="font-size:9px;color:rgba(255,255,255,0.4)">${srcDesc}</div>
            </div>
          </div>
          <div style="display:flex;gap:5px;align-items:center;flex-wrap:wrap;margin-bottom:8px">
            ${c.road_label ? `<span style="font-size:10px;color:#aaa;background:rgba(255,255,255,0.06);padding:2px 6px;border-radius:5px">${c.road_label}</span>` : ''}
            ${c.rating != null ? `<span style="color:#ffd700;font-size:11px;font-weight:700;background:rgba(255,215,0,0.08);padding:2px 6px;border-radius:5px">★ ${c.rating.toFixed(1)}${c.review_count ? ` <span style="color:#888;font-weight:400">(${c.review_count})</span>` : ''}</span>` : ''}
            ${c.open_now != null ? `<span style="font-size:9px;font-weight:700;padding:2px 6px;border-radius:5px;background:${c.open_now ? 'rgba(126,231,135,0.12)' : 'rgba(255,123,114,0.12)'};color:${c.open_now ? '#7ee787' : '#ff7b72'};border:1px solid ${c.open_now ? 'rgba(126,231,135,0.25)' : 'rgba(255,123,114,0.25)'}">${c.open_now ? '● Open' : '○ Closed'}</span>` : ''}
          </div>
          <div style="font-size:11px;color:#666;display:flex;align-items:center;gap:6px">
            <span>${c.distance_m}m away</span>
            ${c.has_barrier ? '<span style="color:#818cf8;font-weight:600">· 🛡 Moat</span>' : ''}
          </div>
        </div>`);
      window.dispatchEvent(new CustomEvent('competitor:selectFromMap', { detail: c }));
    };

    const onGapClick = (e: any) => {
      if (!e.features?.length) return;
      const g = JSON.parse(e.features[0].properties.raw);
      showPopup([g.lng, g.lat], `
        <div style="font:600 13px/1.4 system-ui,sans-serif;color:#e6edf3">
          <div style="font-weight:800;margin-bottom:6px;font-size:14px">${g.source_icon} ${g.name}</div>
          <div style="margin-bottom:8px">
            <span style="background:#7ee78722;color:#7ee787;border:1px solid #7ee78744;border-radius:6px;padding:2px 8px;font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.5px">0 competitors nearby</span>
          </div>
          <div style="font-size:11px;color:#888;margin-bottom:2px;text-transform:capitalize">${g.source_type.replace(/_/g, ' ')}</div>
          <div style="font-size:12px;color:#888">${g.distance_from_site_m}m from site</div>
        </div>`);
      window.dispatchEvent(new CustomEvent('gap:selectFromMap', { detail: g }));
    };

    const onEnter = () => { map.getCanvas().style.cursor = 'pointer'; };
    const onLeave = () => { map.getCanvas().style.cursor = ''; };

    map.on('click', 'comp-pts', onCompClick);
    map.on('click', 'gap-pts', onGapClick);
    ['comp-pts', 'comp-pts-halo'].forEach(l => { map.on('mouseenter', l, onEnter); map.on('mouseleave', l, onLeave); });
    ['gap-pts', 'gap-pts-halo'].forEach(l => { map.on('mouseenter', l, onEnter); map.on('mouseleave', l, onLeave); });

    return () => {
      if (retryTimer) clearTimeout(retryTimer);
      closePopup();
      map.off('click', 'comp-pts', onCompClick);
      map.off('click', 'gap-pts', onGapClick);
      ['comp-pts', 'comp-pts-halo'].forEach(l => { map.off('mouseenter', l, onEnter); map.off('mouseleave', l, onLeave); });
      ['gap-pts', 'gap-pts-halo'].forEach(l => { map.off('mouseenter', l, onEnter); map.off('mouseleave', l, onLeave); });
      cleanup();
    };
  }, [competitorData, opportunityData, activeTab]);

  // Note: map:fitBounds listener moved to ResizeObserver effect for cleaner cleanup

  // ── Auto-zoom to analysis area when data loads ──
  useEffect(() => {
    if (!analysisData || isLoading || !mapRef.current) return;
    
    // For cannibalization, auto-zoom is handled elsewhere
    if (activeTab === 'cannibalization') return;

    try {
      if (analysisType === 'radius' && sitePin) {
        const center = turf.point([sitePin.lng, sitePin.lat]);
        const circle = turf.circle(center, radius / 1000, { units: 'kilometers' });
        const bbox = turf.bbox(circle) as [number, number, number, number];
        mapRef.current.fitBounds(bbox, { padding: getCameraPadding(10), duration: 800 });
      } else if (analysisType === 'polygon' && drawnPolygon) {
        const bbox = turf.bbox(drawnPolygon) as [number, number, number, number];
        mapRef.current.fitBounds(bbox, { padding: getCameraPadding(10), duration: 800 });
      }
    } catch (e) {
      console.warn('Failed to fit bounds:', e);
    }
  }, [analysisData, isLoading, analysisType, sitePin, radius, drawnPolygon, activeTab]);

  // Mode-based click listener
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const dropPin = (lngLat: maplibregl.LngLat, point: maplibregl.Point) => {
      if (analysisType !== 'radius') return;
      const CLICK_GUARD_LAYERS = ['comp-pts', 'comp-pts-halo', 'gap-pts', 'gap-pts-halo'];
      const existingLayers = CLICK_GUARD_LAYERS.filter(id => map.getLayer(id));
      const hit = existingLayers.length > 0
        ? map.queryRenderedFeatures(point, { layers: existingLayers })
        : [];
      if (hit.length > 0) return;
      window.dispatchEvent(new Event('map:clearAll'));
      setSitePin({ lng: lngLat.lng, lat: lngLat.lat });
    };

    const onMapClick = (e: maplibregl.MapMouseEvent) => dropPin(e.lngLat, e.point);

    // Mobile: touchend fires more reliably than the synthetic click on canvas
    let touchStartPos: { x: number; y: number } | null = null;
    const onTouchStart = (e: maplibregl.MapTouchEvent) => {
      const t = e.originalEvent.changedTouches[0];
      touchStartPos = { x: t.clientX, y: t.clientY };
    };
    const onTouchEnd = (e: maplibregl.MapTouchEvent) => {
      if (!touchStartPos) return;
      const t = e.originalEvent.changedTouches[0];
      const dx = Math.abs(t.clientX - touchStartPos.x);
      const dy = Math.abs(t.clientY - touchStartPos.y);
      touchStartPos = null;
      // Only treat as a tap if the finger didn't move more than 8px (not a drag/pan)
      if (dx > 8 || dy > 8) return;
      dropPin(e.lngLat, e.point);
    };

    map.on('click', onMapClick);
    map.on('touchstart', onTouchStart);
    map.on('touchend', onTouchEnd);
    return () => {
      map.off('click', onMapClick);
      map.off('touchstart', onTouchStart);
      map.off('touchend', onTouchEnd);
    };
  }, [analysisType, setSitePin]);

  // Radius/Pin Sync & Animation
  useEffect(() => {
    const map = mapRef.current;
    let animationId: number;

    if (!map || !sitePin) {
      if (map?.getLayer("site-pin-dot")) map.setLayoutProperty("site-pin-dot", "visibility", "none");
      if (map?.getLayer("site-pin-glow")) map.setLayoutProperty("site-pin-glow", "visibility", "none");
      if (map?.getLayer("site-radius")) map.setLayoutProperty("site-radius", "visibility", "none");
      if (map?.getLayer("site-radius-fill")) map.setLayoutProperty("site-radius-fill", "visibility", "none");
      if (map?.getLayer("site-radius-line")) map.setLayoutProperty("site-radius-line", "visibility", "none");
      if (map?.getLayer("site-ping-line")) map.setLayoutProperty("site-ping-line", "visibility", "none");
      return;
    }

    // ── Site pin — WebGL circle layers (no DOM, no CSS dependency) ────────────
    // DOM-based maplibregl.Marker can fail silently in production when MapLibre
    // CSS loads after React hydration. WebGL layers are immune to CSS issues.
    const pinPt: GeoJSON.Feature<GeoJSON.Point> = {
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [sitePin.lng, sitePin.lat] },
      properties: {},
    };

    if (map.getSource('site-pin-src')) {
      (map.getSource('site-pin-src') as maplibregl.GeoJSONSource).setData(pinPt);
      map.setLayoutProperty('site-pin-glow', 'visibility', 'visible');
      map.setLayoutProperty('site-pin-dot', 'visibility', 'visible');
    } else {
      map.addSource('site-pin-src', { type: 'geojson', data: pinPt });

      // Soft outer glow
      map.addLayer({
        id: 'site-pin-glow', type: 'circle', source: 'site-pin-src',
        paint: {
          'circle-color': '#6366f1',
          'circle-radius': 13,
          'circle-opacity': 0.22,
          'circle-stroke-width': 0,
        },
      });

      // Indigo core with white border — mimics the original DOM marker exactly
      map.addLayer({
        id: 'site-pin-dot', type: 'circle', source: 'site-pin-src',
        paint: {
          'circle-color': '#6366f1',
          'circle-radius': 7,
          'circle-opacity': 1,
          'circle-stroke-width': 3,
          'circle-stroke-color': 'white',
          'circle-stroke-opacity': 1,
        },
      });
    }

    // ── Radius circle geometry ─────────────────────────────────────────────────
    const RING_COLOR = '#6366f1';   // indigo-500 — visible on OSM & satellite
    const PULSE_COLOR = '#818cf8';   // indigo-400 — lighter pulse ring

    const circle = turf.circle([sitePin.lng, sitePin.lat], radius / 1000, { units: 'kilometers', steps: 80 });

    if (map.getSource('site-circle')) {
      (map.getSource('site-circle') as maplibregl.GeoJSONSource).setData(circle);
      map.setLayoutProperty('site-radius', 'visibility', 'visible');
      map.setLayoutProperty('site-radius-fill', 'visibility', 'visible');
      map.setLayoutProperty('site-radius-line', 'visibility', 'visible');
      if (map.getLayer('site-ping-line'))
        map.setLayoutProperty('site-ping-line', 'visibility', 'visible');
    } else {
      map.addSource('site-circle', { type: 'geojson', data: circle });
      map.addSource('site-ping-circle', { type: 'geojson', data: circle });

      // Subtle fill so the analysis area reads as a zone, not just a border
      map.addLayer({
        id: 'site-radius-fill', type: 'fill', source: 'site-circle',
        paint: {
          'fill-color': RING_COLOR,
          'fill-opacity': 0.06,        // very subtle — lets the map show through
        },
      });

      // Dashed outer boundary — professional, unobtrusive
      map.addLayer({
        id: 'site-radius-line', type: 'line', source: 'site-circle',
        paint: {
          'line-color': RING_COLOR,
          'line-width': 2.5,
          'line-opacity': 0.9,
          'line-dasharray': [4, 3],  // dashed: reads cleanly on colourful OSM tiles
        },
      });

      // Keep a transparent layer id so legacy getLayer checks don't throw
      map.addLayer({
        id: 'site-radius', type: 'fill', source: 'site-circle',
        paint: { 'fill-color': RING_COLOR, 'fill-opacity': 0 },
      });

      // Expanding pulse ring
      map.addLayer({
        id: 'site-ping-line', type: 'line', source: 'site-ping-circle',
        paint: {
          'line-color': PULSE_COLOR,
          'line-width': 2,
          'line-opacity': 0.8,
        },
      });
    }

    // ── Pulse wave animation ───────────────────────────────────────────────────
    const startTime = performance.now();
    const DURATION = 2800;  // ms per full pulse cycle

    function animatePulse(timestamp: number) {
      if (!mapRef.current || !mapRef.current.getLayer('site-radius-line')) return;

      const progress = Math.max(0, ((timestamp - startTime) % DURATION) / DURATION);

      // Cubic ease-out: fast expand then slow at the edge
      const easeOut = 1 - Math.pow(1 - progress, 3);
      const currentRadiusKm = Math.max(0.0001, (radius / 1000) * easeOut);

      const pingCircle = turf.circle(
        [sitePin.lng, sitePin.lat], currentRadiusKm,
        { units: 'kilometers', steps: 80 },
      );
      const pingSource = mapRef.current.getSource('site-ping-circle') as maplibregl.GeoJSONSource;
      if (pingSource) pingSource.setData(pingCircle);

      // Smooth fade: full opacity when compact, transparent at edge
      const pingOpacity = Math.max(0, Math.min(1, (1 - progress) * 0.9));
      mapRef.current.setPaintProperty('site-ping-line', 'line-opacity', pingOpacity);

      // Outer ring: steady at 0.9, with a very gentle 10% breathe
      const outerOpacity = Math.min(1, 0.85 + Math.sin(timestamp / 1200) * 0.1);
      mapRef.current.setPaintProperty('site-radius-line', 'line-opacity', outerOpacity);

      animationId = requestAnimationFrame(animatePulse);
    }

    animationId = requestAnimationFrame(animatePulse);

    return () => { if (animationId) cancelAnimationFrame(animationId); };
  }, [sitePin, radius]);

  function applyMapMode(mode: MapMode) {
    const map = mapRef.current;
    if (!map || !map.getStyle()) return;
    setMapMode(mode);
    setShowPicker(false);

    const satMode = mode === 'satellite';
    const osmMode = mode === 'osm';
    const hybridMode = mode === 'hybrid';
    const hasRaster = satMode || osmMode || hybridMode;

    if (map.getLayer('satellite-layer')) {
      map.setLayoutProperty('satellite-layer', 'visibility', satMode ? 'visible' : 'none');
    }
    if (map.getLayer('osm-layer')) {
      map.setLayoutProperty('osm-layer', 'visibility', osmMode ? 'visible' : 'none');
    }
    if (map.getLayer('google-hybrid-layer')) {
      map.setLayoutProperty('google-hybrid-layer', 'visibility', hybridMode ? 'visible' : 'none');
    }

    // In OSM mode, hide EVERY vector layer from Martin to prevent duplication with OSM raster.
    // In Satellite mode, hide background fills but keep roads and labels.
    MAP_LAYERS.forEach(layer => {
      if (!map.getLayer(layer.id)) return;

      const isBackgroundOrFill = [
        'map-bg', 'admin-district-fill', 'water-fill', 'landuse-fill',
        'natural-fill', 'buildings-fill', 'buildings-outline'
      ].includes(layer.id);

      if (osmMode || hybridMode) {
        // OSM raster and Google Hybrid both carry their own roads/labels — hide
        // the Martin vector layers so they don't duplicate on top.
        map.setLayoutProperty(layer.id, 'visibility', 'none');
      } else if (satMode) {
        map.setLayoutProperty(layer.id, 'visibility', isBackgroundOrFill ? 'none' : 'visible');
      } else {
        map.setLayoutProperty(layer.id, 'visibility', 'visible');
      }
    });

    // Handle specific opacity adjustments for Satellite and Martin modes
    if (satMode) {
      if (map.getLayer('road-fill')) map.setPaintProperty('road-fill', 'line-opacity', 0.4);
      if (map.getLayer('road-casing')) map.setPaintProperty('road-casing', 'line-opacity', 0.2);
      if (map.getLayer('waterway-line')) map.setPaintProperty('waterway-line', 'line-opacity', 0.4);
      if (map.getLayer('poi-circle')) map.setPaintProperty('poi-circle', 'circle-opacity', 1);
    } else if (!osmMode && !satMode) {
      // Martin mode — restore default opacities
      if (map.getLayer('road-fill')) map.setPaintProperty('road-fill', 'line-opacity', 1);
      if (map.getLayer('road-casing')) map.setPaintProperty('road-casing', 'line-opacity', 0.8);
      if (map.getLayer('waterway-line')) map.setPaintProperty('waterway-line', 'line-opacity', 0.85);
      if (map.getLayer('poi-circle')) map.setPaintProperty('poi-circle', 'circle-opacity', 1);
    }
  };

  const toggleMode = (mode: 'radius' | 'polygon') => {
    setAnalysisType(mode);
    setAnalysisData(null);
    if (mode === 'radius') {
      if (drawRef.current) {
        drawRef.current.deleteAll();
        setDrawnPolygon(null);
      }
    } else {
      setSitePin(null);
      if (drawRef.current) {
        drawRef.current.deleteAll();
        setDrawnPolygon(null);
        setTimeout(() => drawRef.current?.changeMode('draw_polygon'), 50);
      }
    }
  };

  const isInputReady = analysisType === 'radius' ? !!sitePin : !!drawnPolygon;

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
      <div id="map" ref={mapContainerRef} style={{ position: 'absolute', inset: 0 }}></div>

      {/* Geocoding Search - Rendered into the top-left flex container via Portal */}
      {searchPortal && createPortal(
        <GeoSearch onSelect={handleGeoSelect} isMobile={isMobile} />,
        searchPortal
      )}

      {/* Tool Interaction Group */}
      <div style={{
        position: 'absolute',
        top: isMobile ? '8px' : '50%',
        right: isMobile ? '8px' : '20px',
        transform: isMobile ? 'none' : 'translateY(-50%)',
        display: 'flex', flexDirection: 'column', gap: '8px', zIndex: 100, alignItems: 'flex-end',
      }}>

        {/* Zoom + Compass + Layers Nav Tools */}
        <div style={{
          display: 'flex', flexDirection: 'column', background: 'rgba(22, 27, 34, 0.65)', backdropFilter: 'blur(24px)',
          padding: '5px', borderRadius: '13px',
          border: '1px solid var(--glass-border)', boxShadow: 'var(--shadow)',
        }}>
          <button
            onClick={() => mapRef.current?.zoomIn()}
            title="Zoom In"
            style={{
              width: isMobile ? '34px' : '36px',
              height: isMobile ? '34px' : '36px',
              borderRadius: isMobile ? '8px' : '10px',
              border: 'none', cursor: 'pointer',
              background: 'transparent', color: 'var(--text-dim)',
              transition: 'all 0.15s',
              marginBottom: '5px',
              display: 'flex', alignItems: 'center', justifyContent: 'center'
            }}
          >
            <Plus size={isMobile ? 16 : 18} />
          </button>
          <button
            onClick={() => mapRef.current?.zoomOut()}
            title="Zoom Out"
            style={{
              width: isMobile ? '34px' : '36px',
              height: isMobile ? '34px' : '36px',
              borderRadius: isMobile ? '8px' : '10px',
              border: 'none', cursor: 'pointer',
              background: 'transparent', color: 'var(--text-dim)',
              transition: 'all 0.15s',
              marginBottom: '5px',
              display: 'flex', alignItems: 'center', justifyContent: 'center'
            }}
          >
            <Minus size={isMobile ? 16 : 18} />
          </button>

          <div style={{
            height: '1px', alignSelf: 'stretch',
            background: 'var(--border)', margin: '5px 10px'
          }} />

          <button
            onClick={() => { mapRef.current?.resetNorthPitch(); mapRef.current?.flyTo({ bearing: 0, pitch: 0 }); }}
            title="Reset Bearing"
            style={{
              width: isMobile ? '34px' : '36px',
              height: isMobile ? '34px' : '36px',
              borderRadius: isMobile ? '8px' : '10px',
              border: 'none', cursor: 'pointer',
              background: 'transparent', color: 'var(--text-dim)',
              transition: 'all 0.15s',
              marginBottom: '5px',
              display: 'flex', alignItems: 'center', justifyContent: 'center'
            }}
          >
            <Compass size={isMobile ? 16 : 18} />
          </button>

          <div style={{
            height: '1px', alignSelf: 'stretch',
            background: 'var(--border)', margin: '5px 10px'
          }} />

          <button
            onClick={() => setShowPicker(p => !p)}
            title="Change Map Type"
            style={{
              width: isMobile ? '34px' : '36px',
              height: isMobile ? '34px' : '36px',
              borderRadius: isMobile ? '8px' : '10px',
              border: 'none', cursor: 'pointer',
              background: showPicker ? 'rgba(79,156,249,0.15)' : 'transparent',
              color: showPicker ? 'var(--accent)' : 'var(--text-dim)',
              transition: 'all 0.15s',
              display: 'flex', alignItems: 'center', justifyContent: 'center'
            }}
          >
            <Layers size={isMobile ? 16 : 18} />
          </button>
        </div>

        {/* Draw Tools Row */}
        <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', gap: '8px', alignItems: isMobile ? 'flex-end' : 'flex-start' }}>
          {/* Radius stepper */}
          {analysisType === 'radius' && (
            <div style={{
              display: 'flex', alignItems: 'center',
              background: 'rgba(22, 27, 34, 0.65)', backdropFilter: 'blur(24px)',
              WebkitBackdropFilter: 'blur(24px)',
              padding: '3px', borderRadius: '10px', border: '1px solid var(--glass-border)',
              boxShadow: 'var(--shadow)', height: isMobile ? '34px' : '38px',
              animation: 'slideIn 0.3s ease',
            }}>
              <style>{`
                @keyframes slideIn { from { opacity: 0; transform: translateX(20px); } to { opacity: 1; transform: translateX(0); } }
                #radius-map-input { color: var(--accent); }
              `}</style>
              <button onClick={() => setRadius(Math.max(100, radius - 100))} style={{ width: isMobile ? '24px' : '28px', background: 'none', border: 'none', color: 'var(--text-dim)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Minus size={12} />
              </button>
              <input
                id="radius-map-input" type="number" value={radius / 1000} step="0.1"
                onChange={(e) => setRadius(Math.round((parseFloat(e.target.value) || 0) * 1000))}
                onBlur={(e) => setRadius(Math.min(Math.max(Math.round((parseFloat(e.target.value) || 0.1) * 1000), 100), 10000))}
                style={{ width: isMobile ? '34px' : '38px', background: 'none', border: 'none', fontSize: isMobile ? '11px' : '13px', fontWeight: 800, textAlign: 'center', outline: 'none', color: 'var(--accent)' }}
              />
              <span style={{ fontSize: '10px', fontWeight: 800, color: 'var(--text-dim)', paddingRight: '4px' }}>km</span>
              <button onClick={() => setRadius(Math.min(10000, radius + 100))} style={{ width: isMobile ? '24px' : '28px', background: 'none', border: 'none', color: 'var(--text-dim)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Plus size={12} />
              </button>
            </div>
          )}

          {/* Mode + Clear buttons */}
          <div style={{
            display: 'flex', flexDirection: 'column',
            background: 'rgba(22, 27, 34, 0.65)', backdropFilter: 'blur(24px)',
            WebkitBackdropFilter: 'blur(24px)',
            padding: '5px', borderRadius: '13px',
            border: '1px solid var(--glass-border)', boxShadow: 'var(--shadow)',
          }}>
            {[
              { mode: 'radius' as const, icon: <Target size={isMobile ? 16 : 20} />, title: 'Radius Mode' },
              { mode: 'polygon' as const, icon: <Pencil size={isMobile ? 16 : 20} />, title: 'Polygon Mode' },
            ].map(({ mode, icon, title }) => (
              <button key={mode} onClick={() => toggleMode(mode)} title={title} style={{
                width: isMobile ? '34px' : '36px',
                height: isMobile ? '34px' : '36px',
                borderRadius: isMobile ? '8px' : '10px',
                border: 'none', cursor: 'pointer',
                background: analysisType === mode ? 'rgba(79, 156, 249, 0.25)' : 'transparent',
                backdropFilter: analysisType === mode ? 'blur(4px)' : 'none',
                color: analysisType === mode ? 'var(--accent)' : 'var(--text-muted)',
                marginBottom: '5px',
                transition: 'all 0.15s',
                display: 'flex', alignItems: 'center', justifyContent: 'center'
              }}>
                {icon}
              </button>
            ))}
            <div style={{
              height: '1px', alignSelf: 'stretch',
              background: 'var(--border)', margin: '5px 10px'
            }} />
            <button
              onClick={() => { window.dispatchEvent(new Event('map:clearAll')); setSitePin(null); setDrawnPolygon(null); setAnalysisData(null); if (drawRef.current) drawRef.current.deleteAll(); }}
              title="Clear"
              style={{
                width: isMobile ? '34px' : '36px',
                height: isMobile ? '34px' : '36px',
                borderRadius: isMobile ? '8px' : '10px',
                border: 'none', cursor: 'pointer',
                background: 'transparent', color: 'var(--text-dim)',
                transition: 'all 0.15s',
                display: 'flex', alignItems: 'center', justifyContent: 'center'
              }}
            >
              <Trash2 size={isMobile ? 16 : 18} />
            </button>
          </div>
        </div>
      </div>





      {/* ── Bottom-Center Analysis Action Pill ── */}
      {(() => {
        const hasInput = analysisType === 'radius' ? !!sitePin : !!drawnPolygon;
        if (!hasInput) return null;

        const measurementText = analysisType === 'radius' && sitePin
          ? `${(radius / 1000).toFixed(1)} km radius`
          : drawnPolygon
            ? `${(turf.area(drawnPolygon) / 1_000_000).toFixed(2)} km² area`
            : '';

        return (
          <div style={{
            position: 'absolute',
            bottom: isMobile ? '8px' : '30px',
            left: '50%', transform: 'translateX(-50%)',
            zIndex: 150,
            display: 'flex', alignItems: 'center', gap: isMobile ? '6px' : '12px',
            background: 'rgba(22, 27, 34, 0.90)', backdropFilter: 'blur(20px)',
            border: '1px solid rgba(255,255,255,0.1)', borderRadius: '24px',
            padding: isMobile ? '4px 4px 4px 12px' : '6px 6px 6px 16px',
            boxShadow: 'var(--shadow)',
            animation: 'slideUp 0.3s ease',
            whiteSpace: 'nowrap',
            maxWidth: '94%',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', overflow: 'hidden' }}>
              <span style={{ fontSize: isMobile ? '11px' : '13px', color: 'var(--text)', fontWeight: 800, whiteSpace: 'nowrap' }}>{measurementText}</span>
              {sitePin && !isMobile && (
                <>
                  <span style={{ color: 'var(--border)' }}>|</span>
                  <span style={{ fontSize: '11px', color: 'var(--accent2)', fontFamily: '"JetBrains Mono", monospace' }}>
                    {sitePin.lat.toFixed(4)}, {sitePin.lng.toFixed(4)}
                  </span>
                </>
              )}
            </div>

            <button
              onClick={runAnalysis}
              disabled={isLoading}
              style={{
                height: isMobile ? '28px' : '32px',
                padding: isMobile ? '0 10px' : '0 16px',
                borderRadius: '16px',
                border: '1px solid rgba(79, 156, 249, 0.4)',
                cursor: isLoading ? 'not-allowed' : 'pointer',
                background: 'rgba(79, 156, 249, 0.15)',
                color: '#4f9cf9',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
                fontSize: isMobile ? '10px' : '12px', fontWeight: 700, letterSpacing: '0.5px',
                transition: 'all 0.2s',
              }}
            >
              {isLoading ? <Loader2 size={14} className="icon-spin" /> : <Zap size={14} fill="currentColor" />}
              <span style={{ fontSize: '11px', whiteSpace: 'nowrap' }}>
                {isLoading ? 'Analysing Site...' : 'Analyse'}
              </span>
            </button>
          </div>
        );
      })()}

      {/* ── Google Maps-style Layer Picker ── */}
      <div style={{
        position: 'absolute',
        bottom: isMobile ? '40px' : '22px',
        right: '16px',
        zIndex: 200, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0',
      }}>
        <style>{`
          .map-layer-option:hover { border-color: var(--accent) !important; }
          .map-layer-option.active-layer { border-color: var(--accent) !important; box-shadow: 0 0 0 2px rgba(79,156,249,0.3); }
        `}</style>

        {/* Picker card */}
        {showPicker && (
          <div style={{
            background: 'var(--glass-bg)', backdropFilter: 'blur(16px)',
            border: '1px solid var(--border)', borderRadius: '16px',
            padding: '14px', marginBottom: '10px',
            boxShadow: '0 12px 40px rgba(0,0,0,0.5)',
            display: 'flex', flexDirection: 'column', gap: '12px',
            animation: 'mapPickerIn 0.18s ease',
          }}>
            <style>{`
              @keyframes mapPickerIn { from { opacity:0; transform: translateY(8px) scale(0.97); } to { opacity:1; transform: none; } }
            `}</style>
            <div style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '1px', color: 'var(--text-dim)', textTransform: 'uppercase' }}>
              Map Type
            </div>
            <div style={{ display: 'flex', gap: '12px' }}>
              {([
                {
                  id: 'martin' as MapMode,
                  label: 'Site Map',
                  // Dark themed mini map preview
                  preview: (
                    <svg width="64" height="48" viewBox="0 0 64 48" style={{ borderRadius: '8px', display: 'block' }}>
                      <rect width="64" height="48" fill="#0d1117" />
                      <rect x="8" y="20" width="48" height="2" rx="1" fill="#e9c46a" opacity="0.9" />
                      <rect x="14" y="10" width="3" height="28" rx="1" fill="#adb5bd" opacity="0.7" />
                      <rect x="22" y="14" width="3" height="20" rx="1" fill="#6c757d" opacity="0.6" />
                      <rect x="0" y="28" width="25" height="10" rx="1" fill="rgba(100,160,220,0.15)" />
                      <rect x="40" y="8" width="20" height="16" rx="1" fill="rgba(80,200,100,0.18)" />
                      <circle cx="44" cy="34" r="3" fill="#ff7b72" opacity="0.8" />
                      <circle cx="20" cy="16" r="2" fill="#7ee787" opacity="0.8" />
                    </svg>
                  ),
                },

                {
                  id: 'satellite' as MapMode,
                  label: 'Satellite',
                  preview: (
                    <svg width="64" height="48" viewBox="0 0 64 48" style={{ borderRadius: '8px', display: 'block' }}>
                      <defs>
                        <radialGradient id="sg" cx="50%" cy="50%">
                          <stop offset="0%" stopColor="#3a5a3a" />
                          <stop offset="60%" stopColor="#2d4a2d" />
                          <stop offset="100%" stopColor="#1a2e1a" />
                        </radialGradient>
                      </defs>
                      <rect width="64" height="48" fill="url(#sg)" />
                      <rect x="10" y="18" width="20" height="14" rx="1" fill="rgba(180,160,100,0.4)" />
                      <rect x="34" y="8" width="16" height="22" rx="1" fill="rgba(160,180,120,0.3)" />
                      <rect x="0" y="36" width="30" height="12" rx="0" fill="rgba(100,130,90,0.35)" />
                      <line x1="0" y1="22" x2="64" y2="22" stroke="rgba(255,255,255,0.12)" strokeWidth="0.5" />
                    </svg>
                  ),
                },
                {
                  id: 'hybrid' as MapMode,
                  label: 'Hybrid',
                  preview: (
                    <svg width="64" height="48" viewBox="0 0 64 48" style={{ borderRadius: '8px', display: 'block' }}>
                      <defs>
                        <radialGradient id="hg" cx="50%" cy="50%">
                          <stop offset="0%" stopColor="#3a5a3a" />
                          <stop offset="60%" stopColor="#243b24" />
                          <stop offset="100%" stopColor="#14211a" />
                        </radialGradient>
                      </defs>
                      <rect width="64" height="48" fill="url(#hg)" />
                      <rect x="10" y="18" width="20" height="14" rx="1" fill="rgba(180,160,100,0.35)" />
                      <rect x="34" y="8" width="16" height="22" rx="1" fill="rgba(160,180,120,0.28)" />
                      {/* road + label overlay signals the "hybrid" (imagery + labels) look */}
                      <path d="M 2 40 L 30 24 L 62 26" fill="none" stroke="#ffd23f" strokeWidth="1.5" opacity="0.9" />
                      <path d="M 20 46 L 26 6" fill="none" stroke="#ffffff" strokeWidth="1" opacity="0.7" />
                      <rect x="36" y="34" width="14" height="4" rx="1" fill="rgba(255,255,255,0.85)" />
                    </svg>
                  ),
                },
                {
                  id: 'osm' as MapMode,
                  label: 'OpenStreet',
                  preview: (
                    <svg width="64" height="48" viewBox="0 0 64 48" style={{ borderRadius: '8px', display: 'block' }}>
                      <rect width="64" height="48" fill="#f2efe9" />
                      <rect x="0" y="28" width="25" height="10" rx="0" fill="#a5bfdd" />
                      <rect x="40" y="8" width="20" height="16" rx="0" fill="#c8df9f" />
                      <path d="M 8 48 L 24 10 L 64 0" fill="none" stroke="#ffffff" strokeWidth="4" />
                      <path d="M 8 48 L 24 10 L 64 0" fill="none" stroke="#f6c267" strokeWidth="2" />
                    </svg>
                  ),
                },
              ] as { id: MapMode; label: string; preview: React.ReactNode }[]).map(opt => (
                <button
                  key={opt.id}
                  onClick={() => applyMapMode(opt.id)}
                  className={`map-layer-option${mapMode === opt.id ? ' active-layer' : ''}`}
                  style={{
                    background: 'none', border: `2px solid ${mapMode === opt.id ? 'var(--accent)' : 'var(--border)'}`,
                    borderRadius: '10px', padding: '4px', cursor: 'pointer',
                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px',
                    transition: 'border-color 0.15s',
                  }}
                >
                  {opt.preview}
                  <span style={{ fontSize: '10px', fontWeight: mapMode === opt.id ? 700 : 600, color: mapMode === opt.id ? 'var(--accent)' : 'var(--text-muted)' }}>
                    {opt.label}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ── Cannibalization Map Legend ── */}
      {activeTab === 'cannibalization' && sitePin && (
        isMobile ? (
          // Mobile: compact 2×2 grid pill at bottom-center
          <div style={{
            position: 'absolute',
            bottom: isMobile ? '60px' : '80px',
            left: '50%', transform: 'translateX(-50%)',
            background: 'rgba(13,17,23,0.88)', backdropFilter: 'blur(20px)',
            border: '1px solid rgba(255,255,255,0.09)', borderRadius: '14px',
            padding: '6px 10px', zIndex: 190,
            display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 12px',
            animation: 'legendSlideIn 0.4s cubic-bezier(0.16,1,0.3,1)',
            whiteSpace: 'nowrap',
          }}>
            {[
              { color: '#6366f1', dash: false, label: 'Walk (new)' },
              { color: '#f59e0b', dash: true,  label: 'Delivery (new)' },
              { color: '#ef4444', dash: false, label: 'Walk (exist.)' },
              { color: '#a855f7', dash: true,  label: 'Delivery (exist.)' },
            ].map(z => (
              <div key={z.label} style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                <svg width="18" height="10" style={{ flexShrink: 0 }}>
                  <line x1="0" y1="5" x2="18" y2="5" stroke={z.color} strokeWidth={2.5} strokeDasharray={z.dash ? '4,2' : 'none'} />
                </svg>
                <span style={{ fontSize: '9px', color: 'rgba(230,237,243,0.75)' }}>{z.label}</span>
              </div>
            ))}
          </div>
        ) : (
          // Desktop: full vertical legend
          <div style={{
            position: 'absolute',
            bottom: '80px', right: '16px',
            background: 'rgba(13,17,23,0.82)', backdropFilter: 'blur(20px)',
            border: '1px solid rgba(255,255,255,0.09)', borderRadius: '12px',
            padding: '10px 13px', zIndex: 190, minWidth: '160px',
            display: 'flex', flexDirection: 'column', gap: '7px',
            animation: 'legendSlideIn 0.4s cubic-bezier(0.16,1,0.3,1)',
          }}>
            <div style={{ fontSize: '9px', fontWeight: 800, color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>
              Cannibalization Zones
            </div>
            {[
              { color: '#6366f1', dash: false, width: 4, label: 'New site — walk (500 m)' },
              { color: '#f59e0b', dash: true, width: 3.5, label: 'New site — delivery (3 km)' },
              { color: '#ef4444', dash: false, width: 3.5, label: 'Existing outlet — walk' },
              { color: '#a855f7', dash: true, width: 2, label: 'Existing outlet — delivery' },
            ].map(z => (
              <div key={z.label} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <svg width="28" height="12" style={{ flexShrink: 0 }}>
                  <line x1="0" y1="6" x2="28" y2="6" stroke={z.color} strokeWidth={z.width} strokeDasharray={z.dash ? '5,3' : 'none'} />
                </svg>
                <span style={{ fontSize: '10px', color: 'rgba(230,237,243,0.85)' }}>{z.label}</span>
              </div>
            ))}
          </div>
        )
      )}

      {/* ── Demand-Mix Map Legend — only after Analyse has run ── */}
      {activeTab === 'demand-mix' && demandMixData && sitePin && !isMobile && (
        <div style={{
          position: 'absolute',
          bottom: '80px', right: '16px',
          background: 'rgba(13,17,23,0.82)', backdropFilter: 'blur(20px)',
          border: '1px solid rgba(255,255,255,0.09)', borderRadius: '12px',
          padding: '10px 13px', zIndex: 190, minWidth: '150px',
          display: 'flex', flexDirection: 'column', gap: '7px',
          animation: 'legendSlideIn 0.4s cubic-bezier(0.16,1,0.3,1)',
        }}>
          <div style={{ fontSize: '9px', fontWeight: 800, color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>
            Demand Mix · 500 m
          </div>
          {([
            ['office', '#3b82f6', 'Office/Commercial'],
            ['residential', '#22c55e', 'Residential'],
            ['college', '#f97316', 'Education'],
            ['transit', '#818cf8', 'Transit'],
          ] as const).map(([k, color, label]) => (
            <div key={k} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div style={{ width: '10px', height: '10px', borderRadius: '3px', background: color, flexShrink: 0 }} />
              <span style={{ fontSize: '10px', color: 'rgba(230,237,243,0.75)', flex: 1 }}>{label}</span>
              <span style={{ fontSize: '10px', fontWeight: 700, color }}>{demandMixData.mix_pct[k]}%</span>
            </div>
          ))}
        </div>
      )}

      {/* ── Heatmap Legend — gradient synced with active map mode ── */}
      {analysisData?.footfall && activeTab === 'footfall' && (() => {
        const gradients: Record<MapMode, string> = {
          osm: 'linear-gradient(to right, rgba(255,240,120,0.5), rgba(255,190,30,0.7), rgba(255,110,20,0.82), rgba(180,30,10,0.9))',
          satellite: 'linear-gradient(to right, rgba(0,120,255,0.5), rgba(0,220,200,0.7), rgba(255,220,0,0.82), rgba(255,240,240,0.95))',
          hybrid: 'linear-gradient(to right, rgba(0,120,255,0.5), rgba(0,220,200,0.7), rgba(255,220,0,0.82), rgba(255,240,240,0.95))',
          martin: 'linear-gradient(to right, rgba(90,40,170,0.5), rgba(160,60,240,0.7), rgba(251,191,36,0.82), rgba(255,255,255,0.95))',
        };
        const modeLabels: Record<MapMode, string> = {
          osm: 'OpenStreet', satellite: 'Satellite', hybrid: 'Hybrid', martin: 'Site Map',
        };
        return (
          <div style={{
            position: 'absolute',
            bottom: isMobile ? '60px' : '80px',
            right: isMobile ? undefined : '16px',
            left: isMobile ? '50%' : undefined,
            transform: isMobile ? 'translateX(-50%)' : undefined,
            background: 'rgba(13, 17, 23, 0.82)',
            backdropFilter: 'blur(20px)',
            WebkitBackdropFilter: 'blur(20px)',
            border: '1px solid rgba(255,255,255,0.09)',
            borderRadius: isMobile ? '20px' : '12px',
            padding: isMobile ? '5px 12px' : '10px 13px',
            display: 'flex',
            flexDirection: isMobile ? 'row' : 'column',
            alignItems: isMobile ? 'center' : undefined,
            gap: isMobile ? '10px' : '7px',
            zIndex: 190,
            boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
            animation: 'legendSlideIn 0.4s cubic-bezier(0.16, 1, 0.3, 1)',
            minWidth: isMobile ? undefined : '130px',
            whiteSpace: 'nowrap',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: '9px', fontWeight: 800, color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>
                Footfall Density
              </span>
              <span style={{ fontSize: '8px', fontWeight: 600, color: 'rgba(255,255,255,0.22)', letterSpacing: '0.04em' }}>
                {modeLabels[mapMode]}
              </span>
            </div>
            <div style={{ width: '100%', height: '6px', borderRadius: '3px', background: gradients[mapMode] }} />
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ fontSize: '9px', fontWeight: 600, color: 'rgba(255,255,255,0.3)' }}>Low</span>
              <span style={{ fontSize: '9px', fontWeight: 600, color: 'rgba(255,255,255,0.3)' }}>High</span>
            </div>
          </div>
        );
      })()}

      {/* ── Competitor & Gap Map Legend ── */}
      {activeTab === 'competitor' && (competitorData?.list?.length || opportunityData?.gaps?.length) && (
        <div className="map-legend-wrap" style={{
          position: 'absolute',
          bottom: isMobile ? 'calc(var(--panel-h, 0px) + 8px)' : '8px',
          right: '16px',
          zIndex: 190,
        }}>
          {/* Collapsed pill — always visible */}
          <div className="map-legend-pill">
            <svg width="10" height="13" viewBox="0 0 32 44"><path d="M16 2C8.268 2 2 8.268 2 16c0 10 14 26 14 26S30 26 30 16C30 8.268 23.732 2 16 2z" fill="#4f9cf9" stroke="rgba(0,0,0,0.5)" strokeWidth="2" /><circle cx="16" cy="16" r="5" fill="#fff" /></svg>
            <svg width="10" height="13" viewBox="0 0 32 44"><path d="M16 2C8.268 2 2 8.268 2 16c0 10 14 26 14 26S30 26 30 16C30 8.268 23.732 2 16 2z" fill="#3fb950" stroke="rgba(0,0,0,0.5)" strokeWidth="2" /><circle cx="16" cy="16" r="5" fill="#fff" /></svg>
            <svg width="10" height="13" viewBox="0 0 32 44"><path d="M16 2C8.268 2 2 8.268 2 16c0 10 14 26 14 26S30 26 30 16C30 8.268 23.732 2 16 2z" fill="#ffa657" stroke="rgba(0,0,0,0.5)" strokeWidth="2" /><circle cx="16" cy="16" r="5" fill="#fff" /></svg>
            <span className="map-legend-pill-label">Legend</span>
          </div>

          {/* Expanded panel — shown on hover */}
          <div className="map-legend-panel">
            <span className="map-legend-heading">Map Legend</span>
            <div className="map-legend-divider" />

            <span className="map-legend-section">Competitors</span>
            {[
              { color: '#3fb950', label: 'Google + OSM (Enriched)' },
              { color: '#4f9cf9', label: 'Google Places only' },
              { color: '#ffa657', label: 'OpenStreetMap only' },
            ].map((item) => (
              <div key={item.color} className="map-legend-row">
                <svg width="11" height="15" viewBox="0 0 32 44" style={{ flexShrink: 0 }}>
                  <path d="M16 2C8.268 2 2 8.268 2 16c0 10 14 26 14 26S30 26 30 16C30 8.268 23.732 2 16 2z" fill={item.color} stroke="rgba(0,0,0,0.6)" strokeWidth="2.5" />
                  <circle cx="16" cy="16" r="5" fill="#fff" />
                </svg>
                <span className="map-legend-label">{item.label}</span>
              </div>
            ))}

            {!!opportunityData?.gaps?.length && (
              <>
                <div className="map-legend-divider" />
                <span className="map-legend-section">Opportunities</span>
                <div className="map-legend-row">
                  <svg width="12" height="15" viewBox="0 0 32 44" style={{ flexShrink: 0 }}>
                    <path d="M16 2L30 18L16 42L2 18Z" fill="#7ee787" stroke="rgba(0,0,0,0.6)" strokeWidth="2" />
                    <circle cx="16" cy="18" r="5" fill="#fff" />
                  </svg>
                  <span className="map-legend-label">Opportunity Gap</span>
                </div>
              </>
            )}

            <div className="map-legend-divider" />
            <div className="map-legend-row">
              <div className="map-legend-site-dot" />
              <span className="map-legend-label">Your Site</span>
            </div>
          </div>
        </div>
      )}

      {/* ── Global Styles ── */}
      <style>{`
        @keyframes legendSlideIn {
          from { opacity: 0; transform: translateX(20px); }
          to { opacity: 1; transform: translateX(0); }
        }

        /* ── Collapsible map legend ── */
        .map-legend-wrap {
          position: relative;
          display: inline-flex;
          align-items: flex-end;
        }

        /* Collapsed pill */
        .map-legend-pill {
          display: flex;
          align-items: center;
          gap: 4px;
          padding: 5px 10px;
          background: rgba(13,17,23,0.82);
          border: 1px solid rgba(255,255,255,0.09);
          border-radius: 20px;
          backdrop-filter: blur(16px);
          -webkit-backdrop-filter: blur(16px);
          box-shadow: 0 4px 16px rgba(0,0,0,0.5);
          cursor: default;
          transition: opacity 0.2s;
        }
        .map-legend-pill-label {
          font-size: 10px;
          font-weight: 700;
          color: rgba(255,255,255,0.4);
          letter-spacing: 0.04em;
          margin-left: 3px;
        }

        /* Expanded panel — floats above the pill, doesn't affect pill position */
        .map-legend-panel {
          position: absolute;
          bottom: calc(100% + 8px);
          right: 0;
          display: flex;
          flex-direction: column;
          gap: 8px;
          padding: 12px 14px;
          background: rgba(13,17,23,0.92);
          border: 1px solid rgba(255,255,255,0.09);
          border-radius: 14px;
          backdrop-filter: blur(20px);
          -webkit-backdrop-filter: blur(20px);
          box-shadow: 0 8px 32px rgba(0,0,0,0.6);
          min-width: 176px;
          /* collapsed state */
          opacity: 0;
          pointer-events: none;
          transform: translateY(6px) scale(0.97);
          transform-origin: bottom right;
          transition: opacity 0.2s ease, transform 0.2s cubic-bezier(0.16,1,0.3,1);
        }

        /* Expand on hover */
        .map-legend-wrap:hover .map-legend-panel {
          opacity: 1;
          pointer-events: auto;
          transform: translateY(0) scale(1);
        }
        .map-legend-wrap:hover .map-legend-pill {
          opacity: 0.5;
        }

        .map-legend-heading {
          font-size: 9px;
          font-weight: 800;
          color: rgba(255,255,255,0.35);
          text-transform: uppercase;
          letter-spacing: 0.08em;
        }
        .map-legend-section {
          font-size: 9px;
          font-weight: 700;
          color: rgba(255,255,255,0.28);
          text-transform: uppercase;
          letter-spacing: 0.06em;
        }
        .map-legend-divider {
          height: 1px;
          background: rgba(255,255,255,0.06);
          margin: 0 -2px;
        }
        .map-legend-row {
          display: flex;
          align-items: center;
          gap: 9px;
        }
        .map-legend-label {
          font-size: 11px;
          font-weight: 500;
          color: rgba(230,237,243,0.85);
          line-height: 1.2;
        }
        .map-legend-site-dot {
          width: 11px; height: 11px;
          border-radius: 50%;
          flex-shrink: 0;
          background: #6366f1;
          border: 2px solid #fff;
          box-shadow: 0 0 0 2px rgba(99,102,241,0.4);
        }
        @keyframes ffPulse {
          0% { transform: scale(0.8); opacity: 0.6; }
          70% { transform: scale(2.2); opacity: 0; }
          100% { transform: scale(0.8); opacity: 0; }
        }
        /* Dark popup override — matches app glass theme */
        .map-info-popup .maplibregl-popup-content {
          background: rgba(22,27,34,0.96) !important;
          backdrop-filter: blur(20px);
          -webkit-backdrop-filter: blur(20px);
          border: 1px solid rgba(255,255,255,0.08) !important;
          border-radius: 14px !important;
          padding: 14px 16px !important;
          box-shadow: 0 12px 40px rgba(0,0,0,0.7) !important;
          color: #e6edf3;
        }
        .map-info-popup .maplibregl-popup-tip {
          border-top-color: rgba(22,27,34,0.96) !important;
          border-bottom-color: rgba(22,27,34,0.96) !important;
        }
        .map-info-popup .maplibregl-popup-close-button {
          color: #666 !important;
          font-size: 18px !important;
          top: 6px !important;
          right: 10px !important;
          background: none !important;
          border: none !important;
          line-height: 1;
        }
        .map-info-popup .maplibregl-popup-close-button:hover { color: #e6edf3 !important; }
      `}</style>
    </div>
  );
}
