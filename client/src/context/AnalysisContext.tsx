import { createContext, useContext, useState, useCallback, useEffect } from "react";
import * as turf from "@turf/turf";
import type { ReactNode } from "react";
import type { Coordinates, AnalysisData, NdviSnapshotData, CompetitorData, OpportunityData, CompetitorItem, HeadToHeadData, DemandMixData, CannibalizationData, ExistingOutlet } from '../types/analysis';
import { API_BASE, NDVI_BASE } from "../config/constants";

interface AnalysisContextType {
  sitePin: Coordinates | null;
  setSitePin: (coords: Coordinates | null) => void;
  radius: number;
  setRadius: (radius: number) => void;
  analysisData: AnalysisData | null;
  isLoading: boolean;
  error: string | null;
  runAnalysis: () => Promise<void>;
  activeTab: string;
  setActiveTab: (tab: string) => void;
  panelWidth: number;
  setPanelWidth: (w: number) => void;
  isMobile: boolean;
  setIsMobile: (m: boolean) => void;
  analysisType: 'radius' | 'polygon';
  setAnalysisType: (t: 'radius' | 'polygon') => void;
  drawnPolygon: any | null;
  setDrawnPolygon: (p: any | null) => void;
  setAnalysisData: (data: AnalysisData | null) => void;
  // NDVI
  ndviData: NdviSnapshotData | null;
  ndviLoading: boolean;
  ndviError: string | null;
  runNdviAnalysis: () => Promise<void>;
  setNdviData: (data: NdviSnapshotData | null) => void;
  selectedPoi: any | null;
  setSelectedPoi: (poi: any | null) => void;
  // Competitor
  competitorData: CompetitorData | null;
  setCompetitorData: (d: CompetitorData | null) => void;
  opportunityData: OpportunityData | null;
  setOpportunityData: (d: OpportunityData | null) => void;
  selectedCompetitor: CompetitorItem | null;
  setSelectedCompetitor: (c: CompetitorItem | null) => void;
  headToHead: HeadToHeadData | null;
  setHeadToHead: (d: HeadToHeadData | null) => void;
  businessType: string;
  setBusinessType: (t: string) => void;
  competitorMode: 'competitors' | 'gaps';
  setCompetitorMode: (m: 'competitors' | 'gaps') => void;
  // Lazy tab loading
  loadedTabs: Set<string>;
  tabLoading: Record<string, boolean>;
  loadTab: (tabId: string) => Promise<void>;
  // Demand-Driver Mix
  footfallMode: 'standard' | 'tea';
  setFootfallMode: (m: 'standard' | 'tea') => void;
  demandMixData: DemandMixData | null;
  setDemandMixData: (d: DemandMixData | null) => void;
  demandMixLoading: boolean;
  demandMixError: string | null;
  runDemandMix: () => Promise<void>;
  // Cannibalization
  cannibalizationData: CannibalizationData | null;
  setCannibalizationData: (d: CannibalizationData | null) => void;
  cannibalizationLoading: boolean;
  cannibalizationError: string | null;
  existingOutlets: ExistingOutlet[];
  setExistingOutlets: (outlets: ExistingOutlet[]) => void;
  runCannibalization: () => Promise<void>;
}

const AnalysisContext = createContext<AnalysisContextType | undefined>(undefined);

export function AnalysisProvider({ children }: { children: ReactNode }) {
  const [sitePin, setSitePin] = useState<Coordinates | null>(null);
  const [radius, setRadius] = useState<number>(1000);
  const [analysisData, setAnalysisData] = useState<AnalysisData | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<string>("demand-mix");
  const [panelWidth, setPanelWidth] = useState<number>(window.innerWidth * 0.35);
  const [isMobile, setIsMobile] = useState<boolean>(window.innerWidth < 768);
  const [analysisType, setAnalysisType] = useState<'radius' | 'polygon'>('radius');
  const [drawnPolygon, setDrawnPolygon] = useState<any | null>(null);

  // ── NDVI state ──────────────────────────────────────────────────────────────
  const [ndviData,    setNdviData]    = useState<NdviSnapshotData | null>(null);
  const [ndviLoading, setNdviLoading] = useState<boolean>(false);
  const [ndviError,   setNdviError]   = useState<string | null>(null);
  const [selectedPoi, setSelectedPoi] = useState<any | null>(null);
  const [competitorData,    setCompetitorData]    = useState<CompetitorData | null>(null);
  const [opportunityData,   setOpportunityData]   = useState<OpportunityData | null>(null);
  const [selectedCompetitor, setSelectedCompetitor] = useState<CompetitorItem | null>(null);
  const [headToHead,         setHeadToHead]         = useState<HeadToHeadData | null>(null);
  const [businessType,       setBusinessType]       = useState<string>('restaurant');
  const [competitorMode,     setCompetitorMode]     = useState<'competitors' | 'gaps'>('competitors');
  const [loadedTabs, setLoadedTabs] = useState<Set<string>>(new Set());
  const [tabLoading, setTabLoading] = useState<Record<string, boolean>>({});
  // Demand-Driver Mix
  const [footfallMode,     setFootfallMode]     = useState<'standard' | 'tea'>('standard');
  const [demandMixData,    setDemandMixData]    = useState<DemandMixData | null>(null);
  const [demandMixLoading, setDemandMixLoading] = useState(false);
  const [demandMixError,   setDemandMixError]   = useState<string | null>(null);
  // Cannibalization
  const [cannibalizationData,    setCannibalizationData]    = useState<CannibalizationData | null>(null);
  const [cannibalizationLoading, setCannibalizationLoading] = useState(false);
  const [cannibalizationError,   setCannibalizationError]   = useState<string | null>(null);
  const [existingOutlets,        setExistingOutlets]        = useState<ExistingOutlet[]>([]);

  // ── Reset all state when the site changes ────────────────────────────────
  // Fires whenever the user places a new pin or draws a new polygon.
  // This clears both the panel UI and prevents stale data being shown
  // for the old location while the user picks a new one.
  const resetAllAnalysisState = useCallback(() => {
    setAnalysisData(null);
    setLoadedTabs(new Set());
    setTabLoading({});
    setDemandMixData(null);
    setCannibalizationData(null);
    setCompetitorData(null);
    setOpportunityData(null);
    setError(null);
    setIsLoading(false);
  }, []);

  useEffect(() => {
    // Skip on initial mount (sitePin is null → coordinates are undefined)
    if (sitePin?.lat == null) return;
    resetAllAnalysisState();
  }, [sitePin?.lat, sitePin?.lng]);

  useEffect(() => {
    // Reset when a new polygon is drawn (but not when it's cleared/null)
    if (!drawnPolygon) return;
    resetAllAnalysisState();
  }, [drawnPolygon]);

  const buildSiteParams = useCallback(() => {
    if (analysisType === 'radius' && sitePin) {
      return `lng=${sitePin.lng}&lat=${sitePin.lat}&radius=${radius}`;
    } else if (analysisType === 'polygon' && drawnPolygon) {
      const centroid = turf.centroid(drawnPolygon);
      const [lng, lat] = centroid.geometry.coordinates;
      return `lng=${lng}&lat=${lat}&radius=${radius}&custom_polygon=${encodeURIComponent(JSON.stringify(drawnPolygon))}`;
    }
    return null;
  }, [sitePin, radius, analysisType, drawnPolygon]);

  const runAnalysis = useCallback(async () => {
    const params = buildSiteParams();
    if (!params) {
      setError(analysisType === 'radius' ? 'Please select a site on the map first.' : 'Please draw a polygon on the map first.');
      return;
    }

    // Clear all map visualizations immediately — before async fetch begins
    window.dispatchEvent(new Event('map:clearAll'));

    // Reset all data on new analysis run
    setIsLoading(true);
    setError(null);
    setAnalysisData(null);
    setLoadedTabs(new Set());
    setTabLoading({});
    setDemandMixData(null);
    setCannibalizationData(null);
    setCompetitorData(null);
    setOpportunityData(null);

    try {
      // Fetch footfall + demand-mix in parallel (the two immediate tabs)
      const pinLat = sitePin?.lat ?? (() => { const c = turf.centroid(drawnPolygon!); return c.geometry.coordinates[1]; })();
      const pinLng = sitePin?.lng ?? (() => { const c = turf.centroid(drawnPolygon!); return c.geometry.coordinates[0]; })();

      const [footfallRes, demandMixRes] = await Promise.all([
        fetch(`${API_BASE}/api/analysis/footfall?${params}`).then(r => { if (!r.ok) throw new Error(`Footfall ${r.status}`); return r.json(); }),
        fetch(`${API_BASE}/api/demand-mix?lat=${pinLat}&lng=${pinLng}&radius=500`).then(r => r.json()),
      ]);

      setAnalysisData({ footfall: footfallRes.data } as AnalysisData);
      setDemandMixData(demandMixRes.error ? null : demandMixRes);
      setLoadedTabs(new Set(['footfall', 'demand-mix']));
    } catch (err: any) {
      setError(err.message || 'Analysis failed.');
    } finally {
      setIsLoading(false);
    }
  }, [buildSiteParams, sitePin, drawnPolygon, analysisType]);

  // Tab-to-endpoint + analysisData key mapping
  const TAB_ENDPOINT_MAP: Record<string, { endpoint: string; key: keyof AnalysisData }> = {
    landuse:      { endpoint: 'landuse',       key: 'landuse' },
    transport:    { endpoint: 'transport',     key: 'transport' },
    amenity:      { endpoint: 'amenity-score', key: 'amenity' },
    environment:  { endpoint: 'environment',   key: 'environment' },
    connectivity: { endpoint: 'connectivity',  key: 'connectivity' },
  };

  const loadTab = useCallback(async (tabId: string) => {
    const params = buildSiteParams();
    if (!params) return;
    const config = TAB_ENDPOINT_MAP[tabId];
    if (!config) return;
    // Already loaded or currently loading
    if (loadedTabs.has(tabId)) return;
    if (tabLoading[tabId]) return;

    setTabLoading(prev => ({ ...prev, [tabId]: true }));
    try {
      const res = await fetch(`${API_BASE}/api/analysis/${config.endpoint}?${params}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setAnalysisData(prev => ({ ...prev, [config.key]: json.data } as AnalysisData));
      setLoadedTabs(prev => new Set([...prev, tabId]));
    } catch (err: any) {
      console.error(`[loadTab ${tabId}]`, err.message);
    } finally {
      setTabLoading(prev => ({ ...prev, [tabId]: false }));
    }
  }, [buildSiteParams, loadedTabs, tabLoading]);

  // ── Demand-Mix fetch ─────────────────────────────────────────────────────
  const runDemandMix = useCallback(async () => {
    if (!sitePin) { setDemandMixError('Select a site on the map first.'); return; }
    setDemandMixLoading(true);
    setDemandMixError(null);
    try {
      const res = await fetch(`${API_BASE}/api/demand-mix?lat=${sitePin.lat}&lng=${sitePin.lng}&radius=500`);
      if (!res.ok) throw new Error(`Server error ${res.status}`);
      setDemandMixData(await res.json());
    } catch (err: any) {
      setDemandMixError(err.message || 'Demand-mix analysis failed.');
    } finally {
      setDemandMixLoading(false);
    }
  }, [sitePin]);

  // ── Cannibalization fetch ─────────────────────────────────────────────────
  const runCannibalization = useCallback(async () => {
    if (!sitePin) { setCannibalizationError('Select a new site on the map first.'); return; }
    if (!existingOutlets.length) { setCannibalizationError('Add at least one existing outlet.'); return; }
    setCannibalizationLoading(true);
    setCannibalizationError(null);
    try {
      const res = await fetch(`${API_BASE}/api/cannibalization`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newSite: sitePin, existingOutlets }),
      });
      if (!res.ok) throw new Error(`Server error ${res.status}`);
      setCannibalizationData(await res.json());
    } catch (err: any) {
      setCannibalizationError(err.message || 'Cannibalization analysis failed.');
    } finally {
      setCannibalizationLoading(false);
    }
  }, [sitePin, existingOutlets]);

  // ── NDVI fetch — independent of runAnalysis ──────────────────────────────
  // Only works in polygon mode. Sends the drawn geometry to /api/ndvi/snapshot.
  // Node.js backend checks the cache first; only calls Python if needed.
  const runNdviAnalysis = useCallback(async () => {
    if (!drawnPolygon) {
      setNdviError("Please draw a polygon on the map first.");
      return;
    }
    setNdviLoading(true);
    setNdviError(null);
    try {
      // NDVI_BASE = localhost:8000 in dev (Python directly)
      //           = API_BASE in prod (Node.js proxy at /api/ndvi)
      const isLocalPython = NDVI_BASE !== API_BASE;
      const ndviPath = isLocalPython
        ? `${NDVI_BASE}/ndvi/snapshot`       // direct Python: /ndvi/snapshot
        : `${API_BASE}/api/ndvi/snapshot`;    // via Node proxy: /api/ndvi/snapshot

      const res = await fetch(ndviPath, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          geometry:       drawnPolygon.geometry,
          max_cloud_cover: 20,
        }),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e.error || `Server error ${res.status}`);
      }
      setNdviData(await res.json());
    } catch (err: any) {
      setNdviError(err.message || 'NDVI analysis failed.');
    } finally {
      setNdviLoading(false);
    }
  }, [drawnPolygon]);

  const value = {
    sitePin,
    setSitePin,
    radius,
    setRadius,
    analysisData,
    isLoading,
    error,
    runAnalysis,
    activeTab,
    setActiveTab,
    panelWidth,
    setPanelWidth,
    isMobile,
    setIsMobile,
    analysisType,
    setAnalysisType,
    drawnPolygon,
    setDrawnPolygon,
    setAnalysisData,
    // NDVI
    ndviData,
    ndviLoading,
    ndviError,
    runNdviAnalysis,
    setNdviData,
    selectedPoi,
    setSelectedPoi,
    competitorData,
    setCompetitorData,
    opportunityData,
    setOpportunityData,
    selectedCompetitor,
    setSelectedCompetitor,
    headToHead,
    setHeadToHead,
    businessType,
    setBusinessType,
    competitorMode,
    setCompetitorMode,
    loadedTabs,
    tabLoading,
    loadTab,
    // Demand-Driver Mix
    footfallMode,
    setFootfallMode,
    demandMixData,
    setDemandMixData,
    demandMixLoading,
    demandMixError,
    runDemandMix,
    // Cannibalization
    cannibalizationData,
    setCannibalizationData,
    cannibalizationLoading,
    cannibalizationError,
    existingOutlets,
    setExistingOutlets,
    runCannibalization,
  };

  return (
    <AnalysisContext.Provider value={value}>
      {children}
    </AnalysisContext.Provider>
  );
}

export function useAnalysis() {
  const context = useContext(AnalysisContext);
  if (context === undefined) {
    throw new Error("useAnalysis must be used within an AnalysisProvider");
  }
  return context;
}
