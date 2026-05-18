const pool = require("../config/db");

async function landUseBreakdown({ lng, lat, radius }) {
  // way column is EPSG:4326 in planet_osm_polygon — use geography-based DWithin
  const sql = `
    WITH site_geo AS (
      SELECT ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography AS center
    ),
    clipped AS (
      SELECT
        COALESCE(p.landuse, p."natural", p.leisure, 'other') AS category,
        ST_Area(p.way::geography) AS raw_area,
        ST_Area(
          ST_Intersection(
            p.way,
            ST_Buffer(ST_SetSRID(ST_MakePoint($1,$2),4326)::geography, $3)::geometry
          )::geography
        ) AS clipped_area
      FROM planet_osm_polygon p
      WHERE (p.landuse IS NOT NULL OR p."natural" IS NOT NULL OR p.leisure IS NOT NULL)
        AND ST_DWithin(
          p.way::geography,
          ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography,
          $3
        )
    ),
    totals AS (
      SELECT SUM(clipped_area) AS grand_total FROM clipped
    )
    SELECT
      category,
      ROUND(SUM(clipped_area)::numeric, 2) AS area_m2,
      ROUND((SUM(clipped_area) / NULLIF((SELECT grand_total FROM totals), 0) * 100)::numeric, 2) AS pct
    FROM clipped
    GROUP BY category
    ORDER BY area_m2 DESC;
  `;

  const { rows } = await pool.query(sql, [lng, lat, radius]);
  return rows;
}

async function buildingStats({ lng, lat, radius }) {
  // Approximate: count buildings within radius, area using geography
  const sql = `
    SELECT
      COUNT(*) AS building_count,
      ROUND(SUM(ST_Area(way::geography))::numeric, 2) AS total_footprint_m2,
      ROUND(AVG(ST_Area(way::geography))::numeric, 2)  AS avg_footprint_m2,
      ROUND(
        (SUM(ST_Area(way::geography)) / NULLIF(PI() * $3 * $3, 0) * 100)::numeric, 2
      ) AS coverage_pct
    FROM planet_osm_polygon
    WHERE building IS NOT NULL AND building <> 'no'
      AND ST_DWithin(
        way::geography,
        ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography,
        $3
      );
  `;

  const { rows } = await pool.query(sql, [lng, lat, radius]);
  return rows[0];
}

module.exports = { landUseBreakdown, buildingStats };
