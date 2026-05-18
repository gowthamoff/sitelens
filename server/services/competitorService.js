const pool = require('../config/db');
const { fetchGooglePlaces, mergeOsmWithGoogle } = require('./googlePlacesService');

// ─── Business Type SQL Conditions ────────────────────────────────────────────
function businessTypeSQL(param, tableAlias = '') {
  const p = tableAlias ? `${tableAlias}.` : '';
  return `
    CASE
      WHEN ${param} = 'restaurant' THEN
        ${p}amenity IN ('restaurant','fast_food','cafe','food_court','ice_cream','biergarten')
      WHEN ${param} = 'pharmacy' THEN
        ${p}amenity = 'pharmacy' OR ${p}shop IN ('chemist','medical_supply')
      WHEN ${param} = 'grocery' THEN
        ${p}shop IN ('supermarket','convenience','grocery','general','wholesale')
      WHEN ${param} = 'clinic' THEN
        ${p}amenity IN ('clinic','doctors','dentist','veterinary')
      WHEN ${param} = 'hospital' THEN
        ${p}amenity = 'hospital'
      WHEN ${param} = 'education' THEN
        ${p}amenity IN ('school','college','university','training')
      WHEN ${param} = 'fitness' THEN
        ${p}leisure IN ('fitness_centre','sports_centre') OR ${p}shop = 'sports'
      WHEN ${param} = 'bank' THEN
        ${p}amenity IN ('bank','atm')
      WHEN ${param} = 'hotel' THEN
        ${p}tourism IN ('hotel','motel','hostel','guest_house')
      WHEN ${param} = 'tea' THEN
        ${p}amenity IN ('cafe','tea','tea_shop') OR ${p}shop IN ('tea','coffee')
      ELSE false
    END
  `;
}

// ─── Road Type Formatter ──────────────────────────────────────────────────────
function formatRoadType(type) {
  const map = {
    trunk: 'National Highway', motorway: 'Expressway',
    primary: 'State Highway', secondary: 'District Road',
    tertiary: 'Local Road', residential: 'Residential Street',
    service: 'Service Lane', unclassified: 'Unclassified',
  };
  return map[type] || type || 'Unknown';
}

// ─── Competitors Query ────────────────────────────────────────────────────────
async function competitorAnalysis({ lng, lat, radius, business_type = 'restaurant' }) {
  const effectiveRadius = Math.min(radius, 3000);

  const sql = `
    WITH site AS (
      SELECT ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography AS geog
    ),
    competitors AS (
      SELECT
        p.osm_id,
        p.name,
        p.amenity,
        p.shop,
        p.tourism,
        p.leisure,
        p.office,
        ST_X(ST_Transform(p.way, 4326)) AS lng,
        ST_Y(ST_Transform(p.way, 4326)) AS lat,
        ST_Distance(p.way::geography, s.geog) AS distance_m
      FROM planet_osm_point p, site s
      WHERE (${businessTypeSQL("$3")})
        AND ST_DWithin(p.way::geography, s.geog, $4)
        AND p.name IS NOT NULL
      ORDER BY distance_m ASC
      LIMIT 50
    )
    SELECT
      c.*,
      (
        SELECT l.highway
        FROM planet_osm_line l
        WHERE l.highway IS NOT NULL
          AND ST_DWithin(
            l.way::geography,
            ST_SetSRID(ST_MakePoint(c.lng, c.lat), 4326)::geography,
            60
          )
        ORDER BY ST_Distance(l.way::geography, ST_SetSRID(ST_MakePoint(c.lng, c.lat), 4326)::geography)
        LIMIT 1
      ) AS road_type,
      (
        SELECT EXISTS (
          SELECT 1 FROM planet_osm_line bl
          WHERE (
            bl.railway IN ('rail','narrow_gauge','subway')
            OR bl.waterway IN ('river','canal')
            OR bl.highway IN ('motorway','trunk')
          )
          AND ST_Intersects(
            bl.way,
            ST_Transform(
              ST_MakeLine(
                ST_SetSRID(ST_MakePoint($1, $2), 4326),
                ST_SetSRID(ST_MakePoint(c.lng, c.lat), 4326)
              ),
              3857
            )
          )
        )
      ) AS has_barrier
    FROM competitors c;
  `;

  // Run OSM query and Google Places fetch concurrently for maximum speed
  const [{ rows }, googlePlaces] = await Promise.all([
    pool.query(sql, [lng, lat, business_type, effectiveRadius]),
    fetchGooglePlaces({ lat, lng, radius: effectiveRadius, business_type }),
  ]);

  const summary = {
    total_count: rows.length,
    nearest_m: rows.length > 0 ? Math.round(rows[0].distance_m) : null,
    farthest_m: rows.length > 0 ? Math.round(rows[rows.length - 1].distance_m) : null,
    with_barrier: rows.filter(r => r.has_barrier).length,
    on_main_road: rows.filter(r => ['trunk','primary','secondary','motorway'].includes(r.road_type)).length,
    on_side_street: rows.filter(r => ['residential','service','tertiary'].includes(r.road_type)).length,
    by_sub_type: {},
    business_type,
  };

  const subTypeOf = r => r.amenity || r.shop || r.tourism || r.leisure || r.office || 'other';

  // Build the normalised OSM list first
  const osmList = rows.map(r => ({
    osm_id:     r.osm_id,
    name:       r.name,
    distance_m: Math.round(r.distance_m),
    road_type:  r.road_type,
    road_label: formatRoadType(r.road_type),
    has_barrier: r.has_barrier,
    sub_type:   subTypeOf(r),
    lng:        parseFloat(r.lng),
    lat:        parseFloat(r.lat),
    // Google enrichment fields (will be populated after merge)
    rating:       null,
    review_count: null,
    open_now:     null,
    hours:        [],
    price_level:  null,
    address:      null,
    source:       'osm',
  }));

  // Merge OSM + Google (deduplicating within 30m)
  const mergedList = mergeOsmWithGoogle(osmList, googlePlaces, lat, lng);

  // Count Google-only additions for transparency
  const googleOnlyCount = mergedList.filter(r => r.source === 'google').length;
  const enrichedCount   = mergedList.filter(r => r.source === 'osm+google').length;

  // Re-compute summary from merged list
  mergedList.forEach(r => {
    const sub = r.sub_type || 'other';
    summary.by_sub_type[sub] = (summary.by_sub_type[sub] || 0) + 1;
  });
  summary.total_count       = mergedList.length;
  summary.nearest_m         = mergedList.length > 0 ? mergedList[0].distance_m : null;
  summary.farthest_m        = mergedList.length > 0 ? mergedList[mergedList.length - 1].distance_m : null;
  summary.with_barrier      = mergedList.filter(r => r.has_barrier).length;
  summary.on_main_road      = mergedList.filter(r => ['trunk','primary','secondary','motorway'].includes(r.road_type)).length;
  summary.on_side_street    = mergedList.filter(r => ['residential','service','tertiary'].includes(r.road_type)).length;
  summary.google_only_added = googleOnlyCount;
  summary.google_enriched   = enrichedCount;

  const geojson = {
    type: 'FeatureCollection',
    features: mergedList.map(r => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [r.lng, r.lat] },
      properties: {
        osm_id:      r.osm_id   || null,
        google_id:   r.google_id || null,
        name:        r.name,
        sub_type:    r.sub_type,
        distance_m:  r.distance_m,
        road_type:   r.road_type || null,
        road_label:  r.road_label || null,
        has_barrier: r.has_barrier || false,
        rating:      r.rating,
        review_count: r.review_count,
        open_now:    r.open_now,
        price_level: r.price_level,
        source:      r.source,
      },
    })),
  };

  return { summary, geojson, list: mergedList };
}

// ─── Opportunity Gaps Query ───────────────────────────────────────────────────
async function opportunityGaps({ lng, lat, radius, business_type = 'restaurant' }) {
  const effectiveRadius = Math.min(radius, 3000);

  const sql = `
    WITH site AS (
      SELECT ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography AS geog
    ),
    footfall_sources AS (
      SELECT
        p.osm_id,
        p.name,
        p.amenity,
        p.railway,
        p.office,
        ST_X(ST_Transform(p.way, 4326)) AS lng,
        ST_Y(ST_Transform(p.way, 4326)) AS lat,
        p.way,
        ST_Distance(p.way::geography, s.geog) AS distance_from_site_m,
        CASE
          WHEN p.amenity = 'hospital' THEN 'hospital'
          WHEN p.amenity = 'bus_station' THEN 'bus_station'
          WHEN p.amenity = 'cinema' THEN 'cinema'
          WHEN p.amenity IN ('college','university') THEN 'college'
          WHEN p.amenity = 'school' THEN 'school'
          WHEN p.railway = 'station' THEN 'railway_station'
          WHEN p.amenity = 'place_of_worship' THEN 'worship'
          WHEN p.office = 'government' OR p.amenity = 'townhall' THEN 'govt_office'
          WHEN p.amenity = 'marketplace' THEN 'market'
          WHEN p.amenity = 'stadium' THEN 'stadium'
        END AS source_type
      FROM planet_osm_point p, site s
      WHERE (
        p.amenity IN ('hospital','bus_station','cinema','college','university',
                       'school','place_of_worship','townhall','marketplace','stadium')
        OR p.office = 'government'
        OR p.railway = 'station'
      )
        AND ST_DWithin(p.way::geography, s.geog, $3)
        AND p.name IS NOT NULL
    )
    SELECT
      fs.*,
      (
        SELECT COUNT(*)
        FROM planet_osm_point bp
        WHERE (${businessTypeSQL('$4', 'bp')})
          AND ST_DWithin(bp.way::geography, fs.way::geography, 300)
      )::int AS nearby_same_type_count
    FROM footfall_sources fs
    ORDER BY nearby_same_type_count ASC, distance_from_site_m ASC
    LIMIT 30;
  `;

  // Run OSM gaps query and Google Places fetch in parallel
  const [{ rows }, googlePlaces] = await Promise.all([
    pool.query(sql, [lng, lat, effectiveRadius, business_type]),
    fetchGooglePlaces({ lat, lng, radius: effectiveRadius, business_type }),
  ]);

  // Build a quick haversine helper to count Google places near each footfall source
  const haversineM = (lat1, lng1, lat2, lng2) => {
    const R = 6371000, rad = Math.PI / 180;
    const dLat = (lat2 - lat1) * rad, dLng = (lng2 - lng1) * rad;
    const a = Math.sin(dLat / 2) ** 2
            + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  };

  // Normalise Google places to lat/lng for the proximity check
  const googleNorm = googlePlaces
    .map(g => ({ lat: g.location?.latitude, lng: g.location?.longitude }))
    .filter(g => g.lat && g.lng);

  const SOURCE_ICONS = {
    hospital: '🏥', bus_station: '🚌', cinema: '🎬', college: '🎓',
    school: '🏫', railway_station: '🚂', worship: '🛕', govt_office: '🏛️',
    market: '🛒', stadium: '🏟️',
  };

  // Enrich OSM nearby_count with Google count — a gap is only real when BOTH are 0
  const enrichedRows = rows.map(r => {
    const fsLat = parseFloat(r.lat);
    const fsLng = parseFloat(r.lng);
    const googleNearby = googleNorm.filter(g => haversineM(fsLat, fsLng, g.lat, g.lng) <= 300).length;
    return {
      ...r,
      nearby_same_type_count: parseInt(r.nearby_same_type_count) + googleNearby,
      google_nearby_count: googleNearby,
    };
  });

  const gaps = enrichedRows
    .filter(r => r.nearby_same_type_count === 0)
    .map(r => ({
      osm_id: r.osm_id,
      name: r.name,
      source_type: r.source_type,
      source_icon: SOURCE_ICONS[r.source_type] || '📍',
      distance_from_site_m: Math.round(parseFloat(r.distance_from_site_m)),
      nearby_same_type_count: r.nearby_same_type_count,
      lng: parseFloat(r.lng),
      lat: parseFloat(r.lat),
    }));

  const underserved = enrichedRows
    .filter(r => r.nearby_same_type_count === 1)
    .map(r => ({
      osm_id: r.osm_id,
      name: r.name,
      source_type: r.source_type,
      source_icon: SOURCE_ICONS[r.source_type] || '📍',
      distance_from_site_m: Math.round(parseFloat(r.distance_from_site_m)),
      nearby_same_type_count: r.nearby_same_type_count,
      lng: parseFloat(r.lng),
      lat: parseFloat(r.lat),
    }));

  const geojson = {
    type: 'FeatureCollection',
    features: gaps.map(g => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [g.lng, g.lat] },
      properties: { ...g, is_gap: true },
    })),
  };

  return { gaps_count: gaps.length, underserved_count: underserved.length, gaps, underserved, geojson };
}


// ─── Context Query (Head-to-Head) ─────────────────────────────────────────────
async function competitorContext({ comp_lng, comp_lat, site_lng, site_lat }) {
  const contextSQL = `
    WITH loc AS (
      SELECT ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography AS geog
    )
    (
      SELECT 'footfall' AS context_type, p.name, p.amenity AS sub_type,
        ST_Distance(p.way::geography, l.geog) AS distance_m
      FROM planet_osm_point p, loc l
      WHERE (
        p.amenity IN ('hospital','bus_station','cinema','college','university',
                       'school','place_of_worship','townhall','marketplace')
        OR p.office = 'government' OR p.railway = 'station'
      )
        AND ST_DWithin(p.way::geography, l.geog, 600)
        AND p.name IS NOT NULL
      ORDER BY distance_m
      LIMIT 5
    )
    UNION ALL
    (
      SELECT 'road' AS context_type, l.name, l.highway AS sub_type,
        ST_Distance(l.way::geography, loc.geog) AS distance_m
      FROM planet_osm_line l, loc
      WHERE l.highway IS NOT NULL
        AND ST_DWithin(l.way::geography, loc.geog, 80)
      ORDER BY distance_m
      LIMIT 1
    )
    UNION ALL
    (
      SELECT 'barrier' AS context_type,
        COALESCE(l.name, l.waterway, l.railway) AS name,
        COALESCE(l.railway, l.waterway, l.highway) AS sub_type,
        ST_Distance(l.way::geography, loc.geog) AS distance_m
      FROM planet_osm_line l, loc
      WHERE (
        l.railway IN ('rail','narrow_gauge','subway')
        OR l.waterway IN ('river','canal')
        OR l.highway IN ('motorway','trunk')
      )
        AND ST_DWithin(l.way::geography, loc.geog, 500)
      ORDER BY distance_m
      LIMIT 3
    )
    ORDER BY context_type, distance_m;
  `;

  let compCtxRows = [], siteCtxRows = [];
  try {
    const [compCtx, siteCtx] = await Promise.all([
      pool.query(contextSQL, [comp_lng, comp_lat]),
      pool.query(contextSQL, [site_lng, site_lat]),
    ]);
    compCtxRows = compCtx.rows;
    siteCtxRows = siteCtx.rows;
  } catch (err) {
    // Martin/PostGIS offline — return empty context rather than crashing
    console.warn('[competitorContext] PostGIS unavailable, returning empty context:', err.message);
  }

  return {
    competitor: { lng: comp_lng, lat: comp_lat, context: compCtxRows },
    your_site:  { lng: site_lng, lat: site_lat, context: siteCtxRows },
  };
}

module.exports = { competitorAnalysis, opportunityGaps, competitorContext };
