export interface Coordinates {
  lng: number;
  lat: number;
}

export interface AnalysisData {
  proximity?:    ProximityItem[];
  neighbours?:   NeighbourItem[];
  landuse?:      LandUseData;
  transport?:    TransportData;
  amenity?:      AmenityData;
  environment?:  EnvironmentData;
  connectivity?: ConnectivityData;
  risk?:         RiskData;
  footfall?:     FootfallData;
}

// Proximity
export interface ProximityItem {
  category: string;
  nearest_m: number | null;
  count: number;
}
export interface NeighbourItem {
  name?: string;
  amenity?: string;
  shop?: string;
  leisure?: string;
  tourism?: string;
  distance_m: number;
}

// Landuse
export interface LandUseData {
  breakdown: { category: string; area_m2: number; pct: number }[];
  buildings: {
    building_count: number;
    total_footprint_m2: number;
    avg_footprint_m2: number;
    coverage_pct: number;
  };
}

// Transport
export interface TransportData {
  road_types: { road_type: string; total_length_m: number }[];
  transit: { bus_stops: number; rail_stops: number };
  walkability_score: number;
  total_road_length_m: number;
}

// Amenity
export interface AmenityData {
  grade: "A" | "B" | "C" | "D";
  total_score: number;
  breakdown: { key: string; count: number; score: number }[];
}

// Environment
export interface EnvironmentData {
  summary: { water_coverage_pct: number; green_coverage_pct: number; total_green_area_m2: number };
  water_bodies: { water_type: string; area_m2: number }[];
  green_spaces: { green_type: string; area_m2: number }[];
  nearby_waterways: { name?: string; waterway?: string; distance_m: number }[];
}

// Connectivity
export interface ConnectivityData {
  connectivity_index: number;
  connectivity_grade: string;
  road_segments: number;
  total_road_km: number;
  road_density_km_per_km2: number;
  intersection_count: number;
  road_type_diversity: number;
}

// Risk
export interface RiskData {
  risk_score: number;
  risk_level: "Low" | "Moderate" | "High";
  industrial_risks: { risk_type: string; count: number; nearest_m: number }[];
  power_infrastructure: { power_type: string; count: number }[];
  emergency_services: { name?: string; type?: string; distance_m: number }[];
}

// Footfall Density
export interface FootfallHeatmapPoint {
  lng: number;
  lat: number;
  weight: number;
  category: string;
}
export interface FootfallPatienceStatus {
  label: string;
  color: string;
  tier: 'peak' | 'good' | 'moderate' | 'far' | 'none';
}
export interface FootfallTopPoi {
  name?: string;
  distance_m: number;
  lat: number;
  lng: number;
}
export interface FootfallCategoryItem {
  key: string;
  label: string;
  icon: string;
  score: number;
  maxPoints: number;
  count: number;
  nearest_m: number | null;
  idealDistance: number;
  maxDistance: number;
  why: string;
  topPois: FootfallTopPoi[];
  heatmapPoints: FootfallHeatmapPoint[];
  patienceStatus: FootfallPatienceStatus;
}
export interface FootfallTopDriver {
  key: string;
  label: string;
  score: number;
  maxPoints: number;
}
export interface FootfallData {
  total_score: number;
  max_score: number;
  grade: string;
  grade_label: string;
  grade_color: string;
  breakdown: FootfallCategoryItem[];
  top_drivers: FootfallTopDriver[];
  heatmap_points: FootfallHeatmapPoint[];
}

// ─── NDVI (Satellite Vegetation Analysis) ────────────────────────────────────

export interface VegetationBreakdown {
  water_or_shadow: number;     // % pixels with NDVI < 0
  barren_or_built: number;     // % pixels with NDVI 0–0.2
  sparse_vegetation: number;   // % pixels with NDVI 0.2–0.4
  moderate_vegetation: number; // % pixels with NDVI 0.4–0.6
  dense_vegetation: number;    // % pixels with NDVI >= 0.6
}

export interface NdviScene {
  scene_id: string;    // e.g. "S2B_MSIL2A_20260410..."
  scene_date: string;  // ISO date string "2026-04-10"
  cloud_cover: number; // percent 0–100
  platform: string;    // "Sentinel-2A" or "Sentinel-2B"
}

export interface NdviSnapshotData {
  mean_ndvi: number;          // average NDVI across the polygon
  min_ndvi: number;
  max_ndvi: number;
  std_ndvi: number;           // standard deviation (spread)
  health_label: string;       // "Dense Vegetation", "Sparse Vegetation", etc.
  breakdown: VegetationBreakdown;
  scene: NdviScene;
  preview_png_base64: string; // colorized NDVI image to overlay on map
  cached: boolean;            // true = came from cache (instant)
}

export interface NdviTimeseriesPoint {
  date: string;
  mean_ndvi: number;
  cloud_cover: number;
  scene_id: string;
}

export interface NdviTimeseriesData {
  points: NdviTimeseriesPoint[];
  trend: "increasing" | "decreasing" | "stable";
  start_value: number;
  end_value: number;
  delta_percent: number; // e.g. +12.5 means 12.5% greener over the period
}

// ─── Demand-Driver Mix (Tea / QSR zone analysis) ─────────────────────────────

export interface DemandMixAreas {
  office_m2: number;
  residential_m2: number;
  college_m2: number;
  transit_m2: number;
}

export interface DemandMixPct {
  office: number;
  residential: number;
  college: number;
  transit: number;
}

export interface DemandMixData {
  site: { lat: number; lng: number; radius_m: number };
  raw_areas_m2: DemandMixAreas;
  mix_pct: DemandMixPct;
  profile: string;
  peak_pattern: string[];
}

// ─── Cannibalization Analysis ─────────────────────────────────────────────────

export interface ExistingOutlet {
  id: string;
  name: string;
  lat: number;
  lng: number;
}

export interface CannibalizationResult {
  id: string;
  name: string;
  distance_m: number | string;
  walk_overlap_pct: number | string;
  delivery_overlap_pct: number | string;
}

export type CannibalizationLevel = 'safe' | 'low' | 'medium' | 'high';

export interface CannibalizationVerdict {
  level: CannibalizationLevel;
  msg: string;
}

export interface CannibalizationData {
  newSite: { lat: number; lng: number };
  results: CannibalizationResult[];
  verdict: CannibalizationVerdict;
}

// ─── Competitor Analysis ──────────────────────────────────────────────────────

export interface CompetitorItem {
  osm_id?: number | null;
  google_id?: string | null;
  name: string;
  distance_m: number;
  road_type?: string | null;
  road_label?: string;
  has_barrier?: boolean;
  sub_type?: string;
  lng: number;
  lat: number;
  // Google Places enrichment (only present when GOOGLE_PLACES_KEY is set)
  rating?: number | null;
  review_count?: number | null;
  open_now?: boolean | null;
  hours?: string[];
  price_level?: string | null;
  address?: string | null;
  source?: 'osm' | 'google' | 'osm+google';
}

export interface CompetitorSummary {
  total_count: number;
  nearest_m: number | null;
  farthest_m: number | null;
  with_barrier: number;
  on_main_road: number;
  on_side_street: number;
  by_sub_type: Record<string, number>;
  business_type: string;
  // Google enrichment stats
  google_only_added?: number;
  google_enriched?: number;
}

export interface CompetitorGap {
  osm_id: number;
  name: string;
  source_type: string;
  source_icon: string;
  distance_from_site_m: number;
  nearby_same_type_count: number;
  lng: number;
  lat: number;
}

export interface CompetitorData {
  summary: CompetitorSummary;
  list: CompetitorItem[];
  geojson: any;
}

export interface OpportunityData {
  gaps_count: number;
  underserved_count: number;
  gaps: CompetitorGap[];
  underserved: CompetitorGap[];
  geojson: any;
}

export interface HeadToHeadContext {
  context_type: 'footfall' | 'road' | 'barrier';
  name: string;
  sub_type: string;
  distance_m: number;
}

export interface HeadToHeadData {
  competitor: { lng: number; lat: number; context: HeadToHeadContext[] };
  your_site:  { lng: number; lat: number; context: HeadToHeadContext[] };
}


