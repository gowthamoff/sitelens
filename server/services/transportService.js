const pool = require("../config/db");

async function transportStats({ lng, lat, radius }) {
  // planet_osm_line way is EPSG:4326 — use geography DWithin
  const roadSql = `
    WITH clipped AS (
      SELECT
        highway,
        ST_Length(way::geography) AS seg_len
      FROM planet_osm_line
      WHERE highway IS NOT NULL
        AND way && ST_Expand(ST_SetSRID(ST_MakePoint($1, $2), 4326), $3/111320.0)
        AND ST_DWithin(
          way::geography,
          ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography,
          $3
        )
    )
    SELECT
      highway AS road_type,
      COUNT(*) AS segment_count,
      ROUND(SUM(seg_len)::numeric, 2) AS total_length_m
    FROM clipped
    GROUP BY highway
    ORDER BY total_length_m DESC;
  `;

  const transitSql = `
    SELECT
      SUM(CASE WHEN highway = 'bus_stop' THEN 1 ELSE 0 END) AS bus_stops,
      SUM(CASE WHEN railway IN ('station','halt','tram_stop','subway_entrance') THEN 1 ELSE 0 END) AS rail_stops,
      SUM(CASE WHEN amenity = 'ferry_terminal' THEN 1 ELSE 0 END) AS ferry_terminals
    FROM planet_osm_point
    WHERE ST_DWithin(
      way::geography,
      ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography,
      $3
    );
  `;

  const [roadRes, transitRes] = await Promise.all([
    pool.query(roadSql, [lng, lat, radius]),
    pool.query(transitSql, [lng, lat, radius]),
  ]);

  const totalRoadLength = roadRes.rows.reduce(
    (sum, r) => sum + parseFloat(r.total_length_m || 0), 0
  );

  const transitCount =
    parseInt(transitRes.rows[0].bus_stops || 0) +
    parseInt(transitRes.rows[0].rail_stops || 0) * 3;
  const walkabilityScore = Math.min(
    100,
    Math.round((totalRoadLength / 1000 + transitCount * 5) / (radius / 200))
  );

  return {
    road_types: roadRes.rows,
    transit: transitRes.rows[0],
    total_road_length_m: Math.round(totalRoadLength),
    walkability_score: walkabilityScore,
  };
}

module.exports = { transportStats };
