// Upgrade http:// → https:// when the page is served over HTTPS.
// Prevents mixed-content blocks on Amplify (HTTPS host → HTTP API).
// In dev (http://localhost) the URL is returned unchanged.
function withHttps(url: string): string {
  if (!url) return url;
  if (typeof window !== 'undefined' && window.location.protocol === 'https:') {
    return url.replace(/^http:\/\//, 'https://');
  }
  return url;
}

export const API_BASE  = withHttps(import.meta.env.VITE_API_BASE  || '');
// NDVI Base URL — locally hits Python at :8000 directly.
// In production falls back to API_BASE so Node.js proxies it.
export const NDVI_BASE = withHttps(import.meta.env.VITE_NDVI_BASE || '') || API_BASE;
export const TILE_BASE = withHttps(import.meta.env.VITE_TILE_BASE || '') || API_BASE;

export const COLORS = {
  primary: "#4f9cf9",
  success: "#7ee787",
  warning: "#ffa657",
  danger: "#ff7b72",
  gray: "#8b949e",
  border: "#30363d",
  surface: "#161b22",
  surface2: "#21262d",
  text: "#e6edf3"
};

// Colors taken directly from the OSM Carto stylesheet so they match the
// default openstreetmap.org tile rendering exactly.
export const LANDUSE_COLORS: Record<string, string> = {
  // ── Water ────────────────────────────────────────────────────────────────
  water:              '#aad3df',
  reservoir:          '#aad3df',
  basin:              '#aad3df',
  wetland:            '#aed1a0',
  // ── Vegetation ───────────────────────────────────────────────────────────
  forest:             '#add19e',
  wood:               '#add19e',
  scrub:              '#c8d7ab',
  grassland:          '#cdebb0',
  grass:              '#cdebb0',
  meadow:             '#cdebb0',
  heath:              '#d6d99f',
  orchard:            '#aedfa3',
  allotments:         '#c9e1bf',
  farmland:           '#eef0d5',
  farmyard:           '#f5dcba',
  // ── Built-up ─────────────────────────────────────────────────────────────
  residential:        '#ddd9d0',
  commercial:         '#f2cebe',
  retail:             '#fde5c9',
  industrial:         '#e8d4e8',
  construction:       '#c7c7b4',
  brownfield:         '#b5a895',
  greenfield:         '#d8ecca',
  quarry:             '#c5c3c3',
  landfill:           '#b6b5a7',
  // ── Civic / public ───────────────────────────────────────────────────────
  religious:          '#d0d0d0',
  cemetery:           '#aacbaf',
  military:           '#f55f5f',
  // ── Leisure / recreation ─────────────────────────────────────────────────
  park:               '#c8facc',
  garden:             '#cdebb0',
  recreation_ground:  '#dffce2',
  sports_centre:      '#dffce2',
  pitch:              '#aae0cb',
  golf_course:        '#b5e2b5',
  playground:         '#dffce2',
  // ── Natural ──────────────────────────────────────────────────────────────
  beach:              '#fff1ba',
  cliff:              '#d6d2c4',
  other:              '#e8e4e0',
};

// Fallback palette for unknown categories (cycles through these)
const FALLBACK_COLORS = [
  '#aad3df','#add19e','#ddd9d0','#f2cebe','#cdebb0','#aacbaf','#c8facc','#c5c3c3',
];

export function getLanduseColor(category: string, index: number): string {
  const key = category.toLowerCase().replace(/ /g, '_');
  return LANDUSE_COLORS[key] ?? FALLBACK_COLORS[index % FALLBACK_COLORS.length];
}

// Legacy alias — kept so any other import doesn't break
export const CATEGORY_COLORS = [
  '#4a90d9','#3a7a3a','#e8d4b8','#f0b87a','#c8b898','#6ab86a','#d4c87a','#b8bec8',
];
