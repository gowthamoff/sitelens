const pool = require("../config/db");

/**
 * Category-level proximity summary: count and nearest distance per category.
 */
async function proximitySummary({ lng, lat, radius }) {
  const categories = [
    {
      label: "Hospital / Clinic",
      col: "amenity",
      values: ["hospital", "clinic", "doctors"],
    },
    {
      label: "School / Education",
      col: "amenity",
      values: ["school", "university", "college", "kindergarten"],
    },
    {
      label: "Supermarket / Shop",
      col: "shop",
      values: ["supermarket", "mall", "convenience"],
    },
    {
      label: "Restaurant / Café",
      col: "amenity",
      values: ["restaurant", "cafe", "fast_food", "food_court"],
    },
    { label: "Bank / ATM", col: "amenity", values: ["bank", "atm"] },
    {
      label: "Park / Recreation",
      col: "leisure",
      values: ["park", "playground", "garden"],
    },
    { label: "Pharmacy", col: "amenity", values: ["pharmacy"] },
    {
      label: "Police / Fire",
      col: "amenity",
      values: ["police", "fire_station"],
    },
  ];

  const results = await Promise.all(
    categories.map(async (cat) => {
      const vals = cat.values.map((v) => `'${v}'`).join(", ");
      const sql = `
        SELECT
          COUNT(*) AS count,
          MIN(ST_Distance(
            way::geography,
            ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography
          )) AS nearest_m
        FROM planet_osm_point
        WHERE ${cat.col} IN (${vals})
          AND ST_DWithin(
            way::geography,
            ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography,
            $3
          );
      `;

      const { rows } = await pool.query(sql, [lng, lat, radius]);
      return {
        category: cat.label,
        count: parseInt(rows[0].count),
        nearest_m: rows[0].nearest_m ? Math.round(rows[0].nearest_m) : null,
      };
    }),
  );

  return results;
}

/**
 * Nearest neighbours list — for display on map.
 */
async function nearestNeighbours({ lng, lat, radius }) {
  const sql = `
    SELECT
      osm_id,
      name,
      amenity,
      shop,
      leisure,
      tourism,
      ST_Distance(
        way::geography,
        ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography
      ) AS distance_m,
      ST_AsGeoJSON(way) AS geojson
    FROM planet_osm_point
    WHERE (
      amenity IS NOT NULL OR shop IS NOT NULL OR
      leisure IS NOT NULL OR tourism IS NOT NULL
    )
      AND ST_DWithin(
        way::geography,
        ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography,
        $3
      )
    ORDER BY distance_m ASC
    LIMIT 100;
  `;

  const { rows } = await pool.query(sql, [lng, lat, radius]);
  return rows.map((r) => ({
    ...r,
    distance_m: Math.round(r.distance_m),
    geojson: JSON.parse(r.geojson),
  }));
}

module.exports = { proximitySummary, nearestNeighbours };
