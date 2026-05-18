const pool = require("../config/db");

/**
 * Commercial Footfall Density Model
 * Answers: "How many footfall generators are near this site?"
 * Adapted for Indian retail context.
 *
 * Key differences from old proximity model:
 *  - Per-category ideal/max distance (patience levels)
 *  - Quadratic decay (smooth, not stepped buckets)
 *  - Diminishing returns (1st POI = 100%, 2nd = 50%, 3rd = 25%...)
 *  - Returns heatmap_points for MapLibre heatmap rendering
 */

const FOOTFALL_CATEGORIES = [
  {
    key: "transit",
    label: "Transit Stops",
    icon: "bus",
    maxPoints: 15,
    idealDistance: 200,
    maxDistance: 1000,
    why: "Bus/rail stops = guaranteed daily passing traffic",
    sql: `(highway = 'bus_stop' OR amenity IN ('bus_station') OR railway IN ('station','halt','tram_stop'))`,
    table: "planet_osm_point",
  },
  {
    key: "education",
    label: "Education",
    icon: "graduation-cap",
    maxPoints: 15,
    idealDistance: 500,
    maxDistance: 2000,
    why: "Students and parents generate daily foot traffic",
    sql: `amenity IN ('school','college','university','kindergarten','library')`,
    table: "planet_osm_point",
  },
  {
    key: "shopping",
    label: "Retail Cluster",
    icon: "shopping-bag",
    maxPoints: 15,
    idealDistance: 300,
    maxDistance: 1500,
    why: "Retail clusters attract more retail — proven demand zone",
    sql: `shop IN ('supermarket','convenience','mall','department_store','clothes','general','grocery') OR amenity IN ('marketplace')`,
    table: "planet_osm_point",
  },
  {
    key: "worship",
    label: "Places of Worship",
    icon: "landmark",
    maxPoints: 10,
    idealDistance: 300,
    maxDistance: 1500,
    why: "Temples/mosques/churches drive weekly crowds in India",
    sql: `amenity = 'place_of_worship'`,
    table: "planet_osm_point",
  },
  {
    key: "healthcare",
    label: "Healthcare",
    icon: "stethoscope",
    maxPoints: 10,
    idealDistance: 500,
    maxDistance: 2000,
    why: "Daily patient and visitor footfall",
    sql: `amenity IN ('hospital','clinic','doctors','pharmacy','dentist')`,
    table: "planet_osm_point",
  },
  {
    key: "banking",
    label: "Banking & ATMs",
    icon: "landmark",
    maxPoints: 10,
    idealDistance: 300,
    maxDistance: 1000,
    why: "Banks indicate commercial activity; ATMs = guaranteed foot traffic",
    sql: `amenity IN ('bank','atm')`,
    table: "planet_osm_point",
  },
  {
    key: "government",
    label: "Government Offices",
    icon: "building",
    maxPoints: 10,
    idealDistance: 500,
    maxDistance: 2000,
    why: "Government offices generate high daily visitor traffic",
    sql: `amenity IN ('townhall','post_office','police') OR office = 'government'`,
    table: "planet_osm_point",
  },
  {
    key: "food_drink",
    label: "Food & Drink",
    icon: "utensils",
    maxPoints: 10,
    idealDistance: 200,
    maxDistance: 1000,
    why: "Restaurant/café clusters signal a destination area",
    sql: `amenity IN ('restaurant','cafe','fast_food','food_court','bar','pub')`,
    table: "planet_osm_point",
  },
  {
    key: "recreation",
    label: "Recreation & Entertainment",
    icon: "trees",
    maxPoints: 5,
    idealDistance: 500,
    maxDistance: 2000,
    why: "Parks and entertainment venues attract families and weekend crowds",
    sql: `leisure IN ('park','playground','sports_centre','fitness_centre') OR amenity IN ('cinema','theatre')`,
    table: "planet_osm_point",
  },
];

// Total max_points = 15+15+15+10+10+10+10+10+5 = 100 ✓

/**
 * Quadratic decay function — Indian-adapted.
 * Full score within ideal_distance, smooth drop to 0 at max_distance.
 */
function proximityDecay(distanceM, idealDistance, maxDistance) {
  if (distanceM <= idealDistance) return 1.0;
  if (distanceM >= maxDistance) return 0.0;
  const normalized = (distanceM - idealDistance) / (maxDistance - idealDistance);
  return 1.0 - normalized * normalized; // Quadratic: drops slowly then steeply
}

/**
 * Diminishing returns scorer.
 * 1st POI = 100%, 2nd = 50%, 3rd = 25%, 4th = 12.5%, 5th = 6.25%
 * Max achievable sum = 1.9375 (used for normalization)
 */
const MAX_DIMINISH = 1 + 0.5 + 0.25 + 0.125 + 0.0625; // 1.9375

function scoreCategory(distances, config) {
  if (distances.length === 0) return 0;
  let total = 0;
  const top5 = distances.slice(0, 5);
  for (let i = 0; i < top5.length; i++) {
    const diminishing = 1.0 / Math.pow(2, i);
    const decay = proximityDecay(top5[i], config.idealDistance, config.maxDistance);
    total += diminishing * decay;
  }
  return Math.round((total / MAX_DIMINISH) * config.maxPoints * 10) / 10;
}

/**
 * Main footfall analysis function.
 * Returns score breakdown + raw heatmap points for the map overlay.
 */
async function footfallAnalysis({ lng, lat, radius }) {
  // Run all category queries in parallel for performance
  const categoryResults = await Promise.all(
    FOOTFALL_CATEGORIES.map(async (cat) => {
      const effectiveRadius = Math.min(radius, cat.maxDistance);
      const sql = `
        SELECT
          ST_Distance(
            way::geography,
            ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography
          ) AS distance_m,
          ST_X(ST_Transform(way, 4326)) AS lon,
          ST_Y(ST_Transform(way, 4326)) AS lat_coord,
          name
        FROM ${cat.table}
        WHERE (${cat.sql})
          AND ST_DWithin(
            way::geography,
            ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography,
            $3
          )
        ORDER BY distance_m ASC
        LIMIT 20;
      `;

      const { rows } = await pool.query(sql, [lng, lat, effectiveRadius]);
      const distances = rows.map((r) => parseFloat(r.distance_m));
      const score = scoreCategory(distances, cat);
      const nearestM = distances.length > 0 ? Math.round(distances[0]) : null;

      // Build heatmap points — include all found POIs (named or not) for better
      // heatmap coverage. Weight is normalised to 0–1 so MapLibre can render them
      // at full heatmap-weight range. Category importance is encoded via the
      // maxPoints ratio so transit/education/shopping glow brighter.
      const heatmapPoints = rows
        .slice(0, 10)
        .map((r) => ({
          lng: parseFloat(r.lon),
          lat: parseFloat(r.lat_coord),
          // Normalised: decay (0–1) × relative category importance (0.05–0.15 → scale to 0.3–1.0)
          weight: Math.min(1, (cat.maxPoints / 15) * proximityDecay(parseFloat(r.distance_m), cat.idealDistance, cat.maxDistance)),
          category: cat.key,
        }));

      // Top POIs for dashboard display — include unnamed with fallback label
      const topPois = rows
        .slice(0, 5)
        .map((r) => ({
          name: (r.name && r.name.trim()) || 'Unnamed',
          distance_m: Math.round(parseFloat(r.distance_m)),
          lng: parseFloat(r.lon),
          lat: parseFloat(r.lat_coord),
        }));

      return {
        key: cat.key,
        label: cat.label,
        icon: cat.icon,
        score,
        maxPoints: cat.maxPoints,
        count: rows.length,
        nearest_m: nearestM,
        idealDistance: cat.idealDistance,
        maxDistance: cat.maxDistance,
        why: cat.why,
        topPois,
        heatmapPoints,
        // Patience status label for UI
        patienceStatus: getPatienceStatus(nearestM, cat.idealDistance, cat.maxDistance),
      };
    })
  );

  const totalScore = Math.round(
    categoryResults.reduce((sum, c) => sum + c.score, 0)
  );

  // Collect all heatmap points across all categories
  const heatmapPoints = categoryResults.flatMap((c) => c.heatmapPoints);

  // Grade
  const grade = getGrade(totalScore);

  // Top 3 footfall drivers (highest scoring categories)
  const topDrivers = [...categoryResults]
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map((c) => ({ key: c.key, label: c.label, score: c.score, maxPoints: c.maxPoints }));

  return {
    total_score: totalScore,
    max_score: 100,
    grade: grade.letter,
    grade_label: grade.label,
    grade_color: grade.color,
    breakdown: categoryResults,
    top_drivers: topDrivers,
    heatmap_points: heatmapPoints,
  };
}

function getPatienceStatus(nearestM, idealDistance, maxDistance) {
  if (nearestM === null) return { label: "None Found", color: "#ff7b72", tier: "none" };
  if (nearestM <= idealDistance) return { label: "Peak Zone", color: "#7ee787", tier: "peak" };
  if (nearestM <= (idealDistance + maxDistance) / 2) return { label: "Accessible", color: "#a8e6a3", tier: "good" };
  if (nearestM <= maxDistance) return { label: "Reachable", color: "#ffa657", tier: "moderate" };
  return { label: "Too Far", color: "#ff7b72", tier: "far" };
}

function getGrade(score) {
  if (score >= 85) return { letter: "A+", label: "Exceptional Footfall", color: "#7ee787" };
  if (score >= 75) return { letter: "A",  label: "Excellent Footfall",   color: "#7ee787" };
  if (score >= 65) return { letter: "B+", label: "Very Good Footfall",   color: "#a8e6a3" };
  if (score >= 55) return { letter: "B",  label: "Good Footfall",        color: "#ffa657" };
  if (score >= 40) return { letter: "C",  label: "Moderate Footfall",    color: "#ffa657" };
  if (score >= 25) return { letter: "D",  label: "Low Footfall",         color: "#ff9966" };
  return                  { letter: "F",  label: "Poor Footfall",        color: "#ff7b72" };
}

module.exports = { footfallAnalysis, FOOTFALL_CATEGORIES };
