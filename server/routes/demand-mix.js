const express = require('express');
const router = express.Router();
const pool = require('../config/db');

// GET /api/demand-mix?lat=12.9652&lng=80.2080&radius=500
router.get('/demand-mix', async (req, res) => {
  const lat    = parseFloat(req.query.lat);
  const lng    = parseFloat(req.query.lng);
  const radius = parseInt(req.query.radius || '500');

  if (isNaN(lat) || isNaN(lng)) return res.status(400).json({ error: 'lat/lng required' });
  if (radius < 100 || radius > 5000) return res.status(400).json({ error: 'radius must be 100–5000 m' });

  try {
    const { rows: [r] } = await pool.query(`
      WITH site AS (
        SELECT ST_Buffer(ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography, $3)::geometry AS buf
      ),
      -- Exclude admin/boundary polygons (ward, city, state boundaries) that intersect
      -- the buffer but are not buildings. Anything over 5 km² is an admin boundary.
      -- Diagnostic finding: 26 such polys were adding ~10^12 m² to the unclassified bucket.
      valid_polys AS (
        SELECT way, building, landuse, office, amenity
        FROM planet_osm_polygon, site
        WHERE ST_Intersects(way, site.buf)
          AND ST_Area(way::geography) < 5000000
      ),
      office AS (
        SELECT COALESCE(SUM(ST_Area(way::geography)), 0) AS area
        FROM valid_polys
        WHERE building IN ('office','commercial','retail')
           OR landuse  IN ('commercial','retail')
           OR office   IS NOT NULL
      ),
      residential AS (
        -- Include building=yes as residential fallback: in Indian cities, >95% of
        -- untyped building=yes polygons are houses/flats — traced but never attributed.
        SELECT COALESCE(SUM(ST_Area(way::geography)), 0) AS area
        FROM valid_polys
        WHERE building IN ('residential','apartments','house','dormitory','yes')
           OR landuse = 'residential'
      ),
      college AS (
        SELECT COALESCE(SUM(ST_Area(way::geography)), 0) AS area
        FROM valid_polys
        WHERE amenity IN ('college','university','school')
           OR building = 'college'
      ),
      transit AS (
        SELECT COUNT(*) * 2000 AS area
        FROM planet_osm_point, site
        WHERE ST_Intersects(way, site.buf)
          AND (public_transport = 'station'
               OR railway       = 'station'
               OR highway       = 'bus_stop'
               OR amenity       = 'bus_station')
      )
      SELECT
        ROUND(office.area)      AS office_m2,
        ROUND(residential.area) AS residential_m2,
        ROUND(college.area)     AS college_m2,
        transit.area            AS transit_m2
      FROM office, residential, college, transit;
    `, [lng, lat, radius]);

    // pg returns numeric/bigint as strings — coerce to Number so arithmetic works.
    const office_m2      = Number(r.office_m2)      || 0;
    const residential_m2 = Number(r.residential_m2) || 0;
    const college_m2     = Number(r.college_m2)      || 0;
    const transit_m2     = Number(r.transit_m2)      || 0;

    const total = office_m2 + residential_m2 + college_m2 + transit_m2;
    const mix = total === 0
      ? { office: 0, residential: 0, college: 0, transit: 0 }
      : {
          office:      Math.round(office_m2      / total * 100),
          residential: Math.round(residential_m2 / total * 100),
          college:     Math.round(college_m2     / total * 100),
          transit:     Math.round(transit_m2     / total * 100),
        };

    res.json({
      site:         { lat, lng, radius_m: radius },
      raw_areas_m2: { office_m2, residential_m2, college_m2, transit_m2 },
      mix_pct:      mix,
      profile:      classifyProfile(mix),
      peak_pattern: predictPeaks(mix),
    });
  } catch (err) {
    console.error('[DemandMix]', err);
    res.status(500).json({ error: 'demand-mix query failed' });
  }
});

// GET /api/demand-mix-geo?lat=&lng=&radius=500
// Uses the identical ST_Intersects(way, buf) pattern as the working /demand-mix endpoint.
// ST_AsGeoJSON(way) outputs coordinates in whatever SRID 'way' is stored (4326 or 3857).
// The SRID detection sub-query lets ST_Transform work for both storage formats.
router.get('/demand-mix-geo', async (req, res) => {
  const lat    = parseFloat(req.query.lat);
  const lng    = parseFloat(req.query.lng);
  const radius = parseInt(req.query.radius || '500');

  if (isNaN(lat) || isNaN(lng)) return res.status(400).json({ error: 'lat/lng required' });
  if (radius < 100 || radius > 5000) return res.status(400).json({ error: 'radius must be 100–5000 m' });

  try {
    // Detect the SRID of the way column so we can transform correctly.
    // Falls back to 4326 if SRID is 0 (unset) — matching standard geography cast behaviour.
    const { rows: sridRows } = await pool.query(
      `SELECT COALESCE(NULLIF(ST_SRID(way), 0), 4326) AS srid
         FROM planet_osm_polygon LIMIT 1`
    );
    const waySrid = sridRows[0]?.srid ?? 4326;

    // $4 = waySrid.
    // Key fix: ST_Intersection clips each polygon to the 500 m buffer so that large
    // landuse=residential zones (which can cover entire neighbourhoods) appear as
    // focused highlights within the circle instead of invisible map-wide tints.
    const { rows } = await pool.query(`
      WITH site AS (
        SELECT
          -- Buffer in 4326 for GeoJSON output alignment
          ST_Buffer(ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography, $3)::geometry AS buf_4326,
          -- Buffer in the native SRID of 'way' for spatial ops
          ST_Transform(
            ST_Buffer(ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography, $3)::geometry,
            $4::int
          ) AS buf_native
      ),
      -- Compute the clipped geometry first, THEN convert to JSON.
      -- This lets us call ST_IsEmpty() on the geometry type (not on json).
      -- ST_CollectionExtract(..., 3) pulls only Polygon/MultiPolygon parts — needed
      -- because ST_Intersection on buffer edges produces GeometryCollection (poly + sliver lines)
      -- which MapLibre fill layers silently skip.
      polys_raw AS (
        SELECT
          ST_CollectionExtract(
            ST_Intersection(ST_SetSRID(way, $4::int), site.buf_native),
            3
          ) AS clipped,
          CASE
            WHEN building IN ('office','commercial','retail')
              OR landuse  IN ('commercial','retail')
              OR office IS NOT NULL                                         THEN 'office'
            WHEN building IN ('residential','apartments','house','dormitory','yes')
              OR landuse = 'residential'                                    THEN 'residential'
            WHEN amenity IN ('college','university','school')
              OR building = 'college'                                       THEN 'college'
          END AS zone_type
        FROM planet_osm_polygon, site
        WHERE ST_Intersects(way, site.buf_native)
          AND ST_IsValid(way)
          AND ST_Area(way::geography) < 5000000   -- exclude admin/boundary polygons
          AND (
            building IN ('office','commercial','retail',
                         'residential','apartments','house','dormitory','yes')
            OR landuse  IN ('commercial','retail','residential')
            OR office   IS NOT NULL
            OR amenity  IN ('college','university','school')
            OR building = 'college'
          )
      ),
      polys AS (
        -- Filter empty geometries here (on geometry type, not json) before JSON conversion
        SELECT ST_AsGeoJSON(ST_Transform(clipped, 4326))::json AS geom, zone_type
        FROM polys_raw
        WHERE zone_type IS NOT NULL
          AND clipped IS NOT NULL
          AND NOT ST_IsEmpty(clipped)
      ),
      pts AS (
        SELECT
          ST_AsGeoJSON(ST_Transform(ST_SetSRID(way, $4::int), 4326))::json AS geom,
          'transit'                                                          AS zone_type
        FROM planet_osm_point, site
        WHERE ST_Intersects(way, site.buf_native)
          AND (public_transport = 'station' OR railway    = 'station'
               OR highway       = 'bus_stop' OR amenity  = 'bus_station')
      )
      SELECT geom, zone_type FROM polys WHERE geom IS NOT NULL
      UNION ALL
      SELECT geom, zone_type FROM pts   WHERE geom IS NOT NULL
      LIMIT 3000;
    `, [lng, lat, radius, waySrid]);

    const features = rows.map(r => ({
      type: 'Feature',
      geometry: r.geom,
      properties: { zone_type: r.zone_type },
    }));

    console.log(`[DemandMixGeo] ${features.length} features at (${lat},${lng}) r=${radius} waySrid=${waySrid}`);
    res.json({ type: 'FeatureCollection', features });
  } catch (err) {
    console.error('[DemandMixGeo]', err.message);
    res.status(500).json({ error: 'demand-mix-geo query failed', detail: err.message });
  }
});

function classifyProfile(m) {
  const top = Object.entries(m).sort((a, b) => b[1] - a[1])[0];
  if (top[1] < 30) return 'mixed';
  return `${top[0]}_dominant`;
}

function predictPeaks(m) {
  const peaks = [];
  if (m.office      >= 25) peaks.push('10:30–11:30 AM (office break)', '4–5 PM (evening break)');
  if (m.college     >= 25) peaks.push('1–2 PM (lunch break)', '4–7 PM (post-class hangout)');
  if (m.residential >= 25) peaks.push('6–8 AM (breakfast chai)', '6–9 PM (evening social)');
  if (m.transit     >= 20) peaks.push('7–10 AM (morning commute)', '5–8 PM (return commute)');
  if (peaks.length === 0)  peaks.push('Insufficient demand drivers in walking radius');
  return [...new Set(peaks)];
}

module.exports = router;
