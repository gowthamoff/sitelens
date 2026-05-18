/**
 * ─────────────────────────────────────────────────────────────────────────────
 * MAP LAYER CONFIGURATION
 * ─────────────────────────────────────────────────────────────────────────────
 * All Martin tile sources and MapLibre GL layer definitions live here.
 *
 * ZOOM LEVEL QUICK REFERENCE
 * ──────────────────────────
 *  Z 4-5   → Country / State outlines
 *  Z 6-8   → Districts
 *  Z 9-10  → Taluks / Sub-districts
 *  Z 11-12 → Villages / Towns, Water bodies
 *  Z 12-14 → Roads, Railways, Waterways
 *  Z 14-15 → Neighbourhood labels, Areas
 *  Z 15+   → Buildings, POI circles
 *  Z 16+   → POI name labels
 *
 * SOURCE → LAYER MAPPING
 * ──────────────────────
 *  osm_polygons  → admin boundaries, water, landuse, natural, buildings
 *  osm_lines     → waterways, railways, roads, road labels
 *  osm_points    → POI circles, POI labels
 * ─────────────────────────────────────────────────────────────────────────────
 */

// ─────────────────────────────────────────────────────────────────────────────
// OSM ADMIN BOUNDARY HIERARCHY (from planet_osm_polygon)
// ─────────────────────────────────────────────────────────────────────────────
// admin_level=4  → State/Province
// admin_level=5  → Division (rarely used)
// admin_level=6  → District
// admin_level=7  → Taluk / Sub-district (Tamil Nadu specific)
// admin_level=8  → Village / Town / Municipality
// admin_level=9  → Ward / Hamlet
// ─────────────────────────────────────────────────────────────────────────────

export const API_TILE_BASE = (apiBase: string) => apiBase || window.location.origin;

export function buildSources(apiBase: string) {
  const base = API_TILE_BASE(apiBase);
  return {
    osm_points: {
      type: 'vector' as const,
      tiles: [`${base}/tiles/planet_osm_point/{z}/{x}/{y}.pbf`],
      minzoom: 12, maxzoom: 22,
    },
    osm_lines: {
      type: 'vector' as const,
      tiles: [`${base}/tiles/planet_osm_line/{z}/{x}/{y}.pbf`],
      minzoom: 10, maxzoom: 22,
    },
    osm_polygons: {
      type: 'vector' as const,
      tiles: [`${base}/tiles/planet_osm_polygon/{z}/{x}/{y}.pbf`],
      minzoom: 4, maxzoom: 22,
    },
  };
}

export const MAP_LAYERS = [

  // ─── [1] BACKGROUND ────────────────────────────────── always visible ───
  {
    id: 'map-bg',
    type: 'background',
    paint: { 'background-color': '#0d1117' },
  },

  // ─── [2] ADMIN BOUNDARIES ─────────────────────── Z4 (district) → Z11 ───
  // District outline (admin_level=6) — visible from Z6
  {
    id: 'admin-district-fill',
    type: 'fill',
    source: 'osm_polygons',
    'source-layer': 'planet_osm_polygon',
    minzoom: 6, maxzoom: 10,
    filter: ['==', ['get', 'admin_level'], '6'],
    paint: { 'fill-color': '#1a2a3a', 'fill-opacity': 0.35 },
  },
  {
    id: 'admin-district-outline',
    type: 'line',
    source: 'osm_polygons',
    'source-layer': 'planet_osm_polygon',
    minzoom: 6, maxzoom: 12,
    filter: ['==', ['get', 'admin_level'], '5'],
    paint: { 'line-color': '#4a6fa5', 'line-width': 1.5, 'line-dasharray': [4, 2] },
  },
  {
    id: 'admin-district-label',
    type: 'symbol',
    source: 'osm_polygons',
    'source-layer': 'planet_osm_polygon',
    minzoom: 6, maxzoom: 10,
    filter: ['all', ['==', ['get', 'admin_level'], '5'], ['has', 'name']],
    layout: {
      'text-field': ['get', 'name'],
      'text-font': ['Noto Sans Bold'],
      'text-size': 13,
      'text-max-width': 8,
    },
    paint: {
      'text-color': '#79c0ff',
      'text-halo-color': '#050a0e',
      'text-halo-width': 2,
    },
  },

  // Taluk outline (admin_level=7) — visible from Z9
  {
    id: 'admin-taluk-outline',
    type: 'line',
    source: 'osm_polygons',
    'source-layer': 'planet_osm_polygon',
    minzoom: 9, maxzoom: 13,
    filter: ['==', ['get', 'admin_level'], '6'],
    paint: { 'line-color': '#3a5a7a', 'line-width': 1, 'line-dasharray': [3, 2] },
  },
  {
    id: 'admin-taluk-label',
    type: 'symbol',
    source: 'osm_polygons',
    'source-layer': 'planet_osm_polygon',
    minzoom: 9, maxzoom: 12,
    filter: ['all', ['==', ['get', 'admin_level'], '6'], ['has', 'name']],
    layout: {
      'text-field': ['get', 'name'],
      'text-font': ['Noto Sans Regular'],
      'text-size': 11,
    },
    paint: {
      'text-color': '#56a3d9',
      'text-halo-color': '#050a0e',
      'text-halo-width': 2,
    },
  },

  // Village / Town (admin_level=8 or place=village/town) — visible from Z10
  {
    id: 'admin-village-label',
    type: 'symbol',
    source: 'osm_polygons',
    'source-layer': 'planet_osm_polygon',
    minzoom: 10, maxzoom: 13,
    filter: ['all',
      ['any',
        ['==', ['get', 'admin_level'], '7'],
        ['==', ['get', 'place'], 'village'],
        ['==', ['get', 'place'], 'town'],
      ],
      ['has', 'name'],
    ],
    layout: {
      'text-field': ['get', 'name'],
      'text-font': ['Noto Sans Regular'],
      'text-size': 10,
    },
    paint: {
      'text-color': '#a8c8e8',
      'text-halo-color': '#050a0e',
      'text-halo-width': 1.5,
      'text-opacity': 0.85,
    },
  },

  // ─── [3] WATER POLYGONS ──────────────────────────────────────── Z8+ ───
  {
    id: 'water-fill',
    type: 'fill',
    source: 'osm_polygons',
    'source-layer': 'planet_osm_polygon',
    minzoom: 8,
    filter: ['any',
      ['==', ['get', 'natural'], 'water'],
      ['==', ['get', 'landuse'], 'reservoir'],
      ['==', ['get', 'water'], 'lake'],
    ],
    paint: { 'fill-color': '#1a3a5c', 'fill-opacity': 0.95 },
  },

  // ─── [4] LANDUSE FILLS ──────────────────────────────────────── Z11+ ───
  {
    id: 'landuse-fill',
    type: 'fill',
    source: 'osm_polygons',
    'source-layer': 'planet_osm_polygon',
    minzoom: 11,
    filter: ['all', ['has', 'landuse'], ['!', ['==', ['get', 'landuse'], 'reservoir']]],
    paint: {
      'fill-color': [
        'match', ['get', 'landuse'],
        'residential', '#141c26',
        'commercial', '#1a1e14',
        'industrial', '#1f1814',
        'retail', '#1f1c14',
        'forest', '#0f1f12',
        'park', '#0e1f14',
        'cemetery', '#131818',
        'farmland', '#151c13',
        'grass', '#0f1a12',
        '#0d1117',
      ],
      'fill-opacity': 0.9,
    },
  },

  // ─── [5] NATURAL AREAS ──────────────────────────────────────── Z11+ ───
  {
    id: 'natural-fill',
    type: 'fill',
    source: 'osm_polygons',
    'source-layer': 'planet_osm_polygon',
    minzoom: 11,
    filter: ['has', 'natural'],
    paint: {
      'fill-color': [
        'match', ['get', 'natural'],
        'wood', '#0f1f12',
        'scrub', '#131d12',
        'heath', '#131d12',
        'grassland', '#0f1a12',
        '#0d1117',
      ],
      'fill-opacity': 0.9,
    },
  },

  // ─── [6] BUILDINGS ──────────────────────────────────────────── Z15+ ───
  {
    id: 'buildings-fill',
    type: 'fill',
    source: 'osm_polygons',
    'source-layer': 'planet_osm_polygon',
    minzoom: 15,
    filter: ['has', 'building'],
    paint: { 'fill-color': '#1e2535', 'fill-opacity': 0.9 },
  },
  {
    id: 'buildings-outline',
    type: 'line',
    source: 'osm_polygons',
    'source-layer': 'planet_osm_polygon',
    minzoom: 15,
    filter: ['has', 'building'],
    paint: { 'line-color': '#2d3a52', 'line-width': 0.8 },
  },

  // ─── [7] WATERWAYS (lines) ──────────────────────────────────── Z10+ ───
  {
    id: 'waterway-line',
    type: 'line',
    source: 'osm_lines',
    'source-layer': 'planet_osm_line',
    minzoom: 10,
    filter: ['has', 'waterway'],
    paint: {
      'line-color': '#1a6fa0',
      'line-width': ['match', ['get', 'waterway'], 'river', 3, 'stream', 1.5, 1],
      'line-opacity': 0.85,
    },
  },

  // ─── [8] RAILWAYS ───────────────────────────────────────────── Z13+ ───
  {
    id: 'railway-line',
    type: 'line',
    source: 'osm_lines',
    'source-layer': 'planet_osm_line',
    minzoom: 13,
    filter: ['has', 'railway'],
    paint: { 'line-color': '#555e72', 'line-width': 1.5, 'line-dasharray': [3, 2] },
  },

  // ─── [9] ROADS ──────────────────────────────────────────────── Z12+ ───
  {
    id: 'road-casing',   // outline / shadow behind road fill
    type: 'line',
    source: 'osm_lines',
    'source-layer': 'planet_osm_line',
    minzoom: 12,
    filter: ['has', 'highway'],
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: {
      'line-color': '#0a0e16',
      'line-width': ['match', ['get', 'highway'],
        'motorway', 8, 'trunk', 7, 'primary', 6,
        'secondary', 4.5, 'tertiary', 3.5, 2,
      ],
      'line-opacity': 0.8,
    },
  },
  {
    id: 'road-fill',
    type: 'line',
    source: 'osm_lines',
    'source-layer': 'planet_osm_line',
    minzoom: 12,
    filter: ['has', 'highway'],
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: {
      'line-color': ['match', ['get', 'highway'],
        'motorway', '#e76f51',
        'trunk', '#f4a261',
        'primary', '#e9c46a',
        'secondary', '#8a9bb0',
        'tertiary', '#4a5568',
        'residential', '#2d3748',
        'service', '#252d3d',
        '#1e2535',
      ],
      'line-width': ['match', ['get', 'highway'],
        'motorway', 5, 'trunk', 4, 'primary', 3.5,
        'secondary', 2.5, 'tertiary', 2, 'residential', 1.5, 1,
      ],
    },
  },

  // ─── [10] LABELS ────────────────────────────────────────────── Z12+ ───
  {
    id: 'road-labels',
    type: 'symbol',
    source: 'osm_lines',
    'source-layer': 'planet_osm_line',
    minzoom: 14,
    filter: ['all', ['has', 'highway'], ['has', 'name']],
    layout: {
      'symbol-placement': 'line',
      'text-field': ['get', 'name'],
      'text-font': ['Noto Sans Regular'],
      'text-size': ['match', ['get', 'highway'], 'motorway', 13, 'primary', 12, 11],
      'text-max-angle': 30,
      'symbol-spacing': 250,
    },
    paint: {
      'text-color': '#c8d0dc',
      'text-halo-color': '#0a0e16',
      'text-halo-width': 2,
    },
  },
  {
    id: 'area-labels',
    type: 'symbol',
    source: 'osm_polygons',
    'source-layer': 'planet_osm_polygon',
    minzoom: 13,
    filter: ['all', ['has', 'name'],
      ['any', ['has', 'leisure'], ['has', 'landuse'], ['has', 'natural']],
    ],
    layout: {
      'text-field': ['get', 'name'],
      'text-font': ['Noto Sans Italic'],
      'text-size': 11,
      'text-max-width': 8,
    },
    paint: {
      'text-color': '#7ee787',
      'text-halo-color': '#050a0e',
      'text-halo-width': 2,
      'text-opacity': 0.85,
    },
  },
  {
    id: 'water-labels',
    type: 'symbol',
    source: 'osm_polygons',
    'source-layer': 'planet_osm_polygon',
    minzoom: 12,
    filter: ['all', ['has', 'name'],
      ['any', ['==', ['get', 'natural'], 'water'], ['==', ['get', 'landuse'], 'reservoir']],
    ],
    layout: {
      'text-field': ['get', 'name'],
      'text-font': ['Noto Sans Italic'],
      'text-size': 12,
    },
    paint: {
      'text-color': '#4fc3f7',
      'text-halo-color': '#050a0e',
      'text-halo-width': 2,
    },
  },

  // ─── [11] POIs ──────────────────────────────────────────────── Z15+ ───
  {
    id: 'poi-circle',
    type: 'circle',
    source: 'osm_points',
    'source-layer': 'planet_osm_point',
    minzoom: 15,
    filter: ['has', 'amenity'],
    paint: {
      'circle-radius': 5,
      'circle-color': ['match', ['get', 'amenity'],
        'hospital', '#ff7b72',
        'clinic', '#ff9966',
        'school', '#ffa657',
        'university', '#ffa657',
        'restaurant', '#7ee787',
        'cafe', '#79c0ff',
        'fast_food', '#a8d8a8',
        'bank', '#e3b341',
        'atm', '#e3b341',
        'police', '#d2a8ff',
        'pharmacy', '#ff79a8',
        'supermarket', '#56d364',
        '#4f9cf9',
      ],
      'circle-stroke-width': 1.5,
      'circle-stroke-color': '#0a0e16',
      'circle-opacity': 0.9,
    },
  },
  {
    id: 'poi-labels',
    type: 'symbol',
    source: 'osm_points',
    'source-layer': 'planet_osm_point',
    minzoom: 16,
    filter: ['all', ['has', 'amenity'], ['has', 'name']],
    layout: {
      'text-field': ['get', 'name'],
      'text-font': ['Noto Sans Regular'],
      'text-size': 11,
      'text-offset': [0, 1.2],
      'text-anchor': 'top',
      'text-max-width': 7,
    },
    paint: {
      'text-color': '#e0e6f0',
      'text-halo-color': '#070b12',
      'text-halo-width': 1.5,
    },
  },
] as Record<string, unknown>[];
