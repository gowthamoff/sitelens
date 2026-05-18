const pool = require("../config/db");

async function riskAssessment({ lng, lat, radius }) {
  // planet_osm_polygon way is EPSG:4326 — use geography
  const industrialSql = `
    SELECT
      COALESCE(landuse, man_made) AS risk_type,
      COUNT(*) AS count,
      ROUND(MIN(ST_Distance(
        way::geography,
        ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography
      ))::numeric, 2) AS nearest_m,
      ROUND(SUM(ST_Area(way::geography))::numeric, 2) AS area_m2
    FROM planet_osm_polygon
    WHERE (
      landuse IN ('industrial','quarry','landfill','construction','brownfield')
      OR man_made IN ('wastewater_plant','water_works','petroleum_well','chimney')
    )
      AND ST_DWithin(
        way::geography,
        ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography,
        $3
      )
    GROUP BY risk_type
    ORDER BY nearest_m ASC;
  `;

  const powerSql = `
    SELECT power AS power_type, COUNT(*) AS count
    FROM planet_osm_point
    WHERE power IS NOT NULL
      AND ST_DWithin(
        way::geography,
        ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography,
        $3
      )
    GROUP BY power ORDER BY count DESC;
  `;

  const emergencySql = `
    SELECT
      amenity AS type, name,
      ROUND(ST_Distance(
        way::geography,
        ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography
      )::numeric, 2) AS distance_m
    FROM planet_osm_point
    WHERE amenity IN ('hospital','fire_station','police','ambulance_station')
      AND ST_DWithin(
        way::geography,
        ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography,
        $3
      )
    ORDER BY distance_m ASC LIMIT 5;
  `;

  const [industRes, powerRes, emergRes] = await Promise.all([
    pool.query(industrialSql, [lng, lat, radius]),
    pool.query(powerSql, [lng, lat, radius]),
    pool.query(emergencySql, [lng, lat, radius]),
  ]);

  const industrialArea = industRes.rows.reduce(
    (s, r) => s + parseFloat(r.area_m2 || 0),
    0,
  );
  const emergencyCount = emergRes.rows.length;
  const riskScore = Math.min(
    100,
    Math.round(
      (industrialArea / 10000) * 20 + Math.max(0, 5 - emergencyCount) * 10,
    ),
  );

  return {
    industrial_risks: industRes.rows,
    power_infrastructure: powerRes.rows,
    emergency_services: emergRes.rows,
    risk_score: riskScore,
    risk_level: riskScore >= 70 ? "High" : riskScore >= 40 ? "Moderate" : "Low",
  };
}

module.exports = { riskAssessment };
