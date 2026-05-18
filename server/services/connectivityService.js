const pool = require("../config/db");

async function connectivityAnalysis({ lng, lat, radius }) {
  const bufferArea_km2 = (Math.PI * radius * radius) / 1_000_000;

  // Use planet_osm_roads for major roads (already filtered, faster)
  // planet_osm_line way is EPSG:4326
  const roadDensitySql = `
    SELECT
      COUNT(*) AS road_segments,
      ROUND((SUM(ST_Length(way::geography)) / 1000)::numeric, 3) AS total_km
    FROM planet_osm_line
    WHERE highway IS NOT NULL
      AND highway NOT IN ('footway','path','cycleway','steps','pedestrian')
      AND ST_DWithin(
        way::geography,
        ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography,
        $3
      );
  `;

  // Intersection count via shared endpoints
  const intersectionSql = `
    WITH road_nodes AS (
      SELECT unnest(ARRAY[ST_StartPoint(way), ST_EndPoint(way)]) AS node
      FROM planet_osm_line
      WHERE highway IS NOT NULL
        AND ST_DWithin(
          way::geography,
          ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography,
          $3
        )
    )
    SELECT COUNT(*) AS intersections
    FROM (
      SELECT node, COUNT(*) AS cnt
      FROM road_nodes
      GROUP BY node
      HAVING COUNT(*) >= 3
    ) t;
  `;

  const diversitySql = `
    SELECT COUNT(DISTINCT highway) AS diversity_count
    FROM planet_osm_line
    WHERE highway IS NOT NULL
      AND ST_DWithin(
        way::geography,
        ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography,
        $3
      );
  `;

  const [densityRes, intersRes, diversRes] = await Promise.all([
    pool.query(roadDensitySql, [lng, lat, radius]),
    pool.query(intersectionSql, [lng, lat, radius]),
    pool.query(diversitySql, [lng, lat, radius]),
  ]);

  const roadKm = parseFloat(densityRes.rows[0].total_km || 0);
  const density = Math.round((roadKm / bufferArea_km2) * 100) / 100;
  const intersections = parseInt(intersRes.rows[0].intersections || 0);
  const diversity = parseInt(diversRes.rows[0].diversity_count || 0);

  const connectivityIndex = Math.min(
    100,
    Math.round(density * 4 + intersections * 0.5 + diversity * 3)
  );

  return {
    road_segments: parseInt(densityRes.rows[0].road_segments || 0),
    total_road_km: roadKm,
    road_density_km_per_km2: density,
    intersection_count: intersections,
    road_type_diversity: diversity,
    connectivity_index: connectivityIndex,
    connectivity_grade:
      connectivityIndex >= 80 ? "Excellent" :
      connectivityIndex >= 60 ? "Good" :
      connectivityIndex >= 40 ? "Fair" : "Poor",
  };
}

module.exports = { connectivityAnalysis };
