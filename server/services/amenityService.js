const pool = require("../config/db");

/**
 * Weighted amenity score (0-100) based on presence and proximity.
 * Categories: health, education, retail, food, finance, leisure, safety.
 */
async function amenityScore({ lng, lat, radius }) {
  const categories = [
    {
      key: "health",
      weight: 20,
      maxScore: 5,
      sql: "amenity IN ('hospital', 'clinic', 'doctors', 'dentist', 'pharmacy')",
    },
    {
      key: "education",
      weight: 20,
      maxScore: 5,
      sql: "amenity IN ('school', 'university', 'college', 'kindergarten', 'library')",
    },
    {
      key: "retail",
      weight: 15,
      maxScore: 5,
      sql: "amenity IN ('marketplace', 'mall') OR shop IN ('supermarket', 'convenience', 'bakery', 'butcher')",
    },
    {
      key: "food",
      weight: 10,
      maxScore: 8,
      sql: "amenity IN ('restaurant', 'cafe', 'fast_food', 'food_court', 'pub')",
    },
    {
      key: "finance",
      weight: 10,
      maxScore: 3,
      sql: "amenity IN ('bank', 'atm')",
    },
    {
      key: "leisure",
      weight: 15,
      maxScore: 5,
      sql: "leisure IN ('park', 'playground', 'sports_centre', 'swimming_pool', 'fitness_centre')",
    },
    {
      key: "safety",
      weight: 10,
      maxScore: 3,
      sql: "amenity IN ('police', 'fire_station', 'hospital')",
    },
  ];

  const scores = await Promise.all(
    categories.map(async (cat) => {
      const sql = `
        SELECT COUNT(*) AS cnt
        FROM planet_osm_point
        WHERE (${cat.sql})
          AND ST_DWithin(
            way::geography,
            ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography,
            $3
          );
      `;

      const { rows } = await pool.query(sql, [lng, lat, radius]);
      const count = parseInt(rows[0].cnt);
      const rawScore = Math.min(count, cat.maxScore) / cat.maxScore;
      const weightedScore = rawScore * cat.weight;

      return { key: cat.key, count, score: Math.round(weightedScore * 10) / 10 };
    })
  );

  const totalScore = Math.round(scores.reduce((s, c) => s + c.score, 0));

  return {
    total_score: totalScore,
    max_score: 100,
    grade: totalScore >= 80 ? "A" : totalScore >= 60 ? "B" : totalScore >= 40 ? "C" : "D",
    breakdown: scores,
  };
}

module.exports = { amenityScore };
