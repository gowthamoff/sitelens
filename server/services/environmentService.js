const pool = require("../config/db");

async function environmentalScan({ lng, lat, radius }) {
  // Clip every polygon to the analysis circle before summing area so that large
  // water bodies / forests that only partially overlap are counted correctly and
  // percentages never exceed 100%.
  const waterSql = `
    WITH circle AS (
      SELECT ST_Buffer(
        ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography, $3
      )::geometry AS geom
    )
    SELECT
      COALESCE(water, waterway, "natural", 'water') AS water_type,
      ROUND(
        SUM(
          ST_Area(
            ST_Intersection(p.way, (SELECT geom FROM circle))::geography
          )
        )::numeric, 2
      ) AS area_m2
    FROM planet_osm_polygon p, circle
    WHERE (water IS NOT NULL OR waterway IS NOT NULL OR "natural" IN ('water','wetland'))
      AND ST_Intersects(p.way, circle.geom)
    GROUP BY water_type
    HAVING SUM(ST_Area(ST_Intersection(p.way, circle.geom)::geography)) > 0
    ORDER BY area_m2 DESC;
  `;

  const greenSql = `
    WITH circle AS (
      SELECT ST_Buffer(
        ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography, $3
      )::geometry AS geom
    )
    SELECT
      COALESCE(landuse, leisure, "natural") AS green_type,
      ROUND(
        SUM(
          ST_Area(
            ST_Intersection(p.way, (SELECT geom FROM circle))::geography
          )
        )::numeric, 2
      ) AS area_m2
    FROM planet_osm_polygon p, circle
    WHERE (
      landuse IN ('forest','meadow','orchard','vineyard','allotments')
      OR leisure IN ('park','garden','nature_reserve')
      OR "natural" IN ('wood','scrub','grassland','heath')
    )
      AND ST_Intersects(p.way, circle.geom)
    GROUP BY green_type
    HAVING SUM(ST_Area(ST_Intersection(p.way, circle.geom)::geography)) > 0
    ORDER BY area_m2 DESC;
  `;

  const waterLineSql = `
    SELECT
      name,
      waterway,
      ROUND(ST_Distance(
        way::geography,
        ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography
      )::numeric, 2) AS distance_m
    FROM planet_osm_line
    WHERE waterway IN ('river','stream','canal','drain')
      AND ST_DWithin(
        way::geography,
        ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography,
        $3
      )
    ORDER BY distance_m
    LIMIT 5;
  `;

  const [waterRes, greenRes, waterLineRes] = await Promise.all([
    pool.query(waterSql, [lng, lat, radius]),
    pool.query(greenSql, [lng, lat, radius]),
    pool.query(waterLineSql, [lng, lat, radius]),
  ]);

  const totalWater = waterRes.rows.reduce((s, r) => s + parseFloat(r.area_m2 || 0), 0);
  const totalGreen = greenRes.rows.reduce((s, r) => s + parseFloat(r.area_m2 || 0), 0);
  // True geodesic area of the analysis circle in m²
  const bufferArea = Math.PI * radius * radius;

  const waterPct = Math.min(100, Math.round((totalWater / bufferArea) * 10000) / 100);
  const greenPct = Math.min(100, Math.round((totalGreen / bufferArea) * 10000) / 100);

  return {
    water_bodies: waterRes.rows,
    green_spaces: greenRes.rows,
    nearby_waterways: waterLineRes.rows,
    summary: {
      water_coverage_pct: waterPct,
      green_coverage_pct: Math.min(greenPct, Math.max(0, 100 - waterPct)),
      total_water_area_m2: Math.round(totalWater),
      total_green_area_m2: Math.round(totalGreen),
    },
  };
}

module.exports = { environmentalScan };
