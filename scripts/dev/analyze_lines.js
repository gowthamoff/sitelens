const pool = require("./config/db");

async function analyzeLines() {
  const query = async (label, sql) => {
    try {
      const res = await pool.query(sql);
      console.log(`\n--- ${label} ---`);
      console.table(res.rows);
    } catch (err) {
      console.error(`Error analyzing ${label}:`, err.message);
    }
  };

  console.log("Starting deep line analysis (this may take a minute)...\n");

  // 1. Total Count
  await query("Total Line Segments", `SELECT COUNT(*) AS total_count FROM planet_osm_line`);

  // 2. Highway Distribution (Roads)
  await query("Top Highway/Road Types", `
    SELECT highway, COUNT(*) AS count, 
    ROUND((SUM(ST_Length(way::geography))/1000)::numeric, 2) AS total_km
    FROM planet_osm_line
    WHERE highway IS NOT NULL
    GROUP BY highway
    ORDER BY count DESC
    LIMIT 15;
  `);

  // 3. Waterway Distribution
  await query("Waterway Distribution", `
    SELECT waterway, COUNT(*) AS count,
    ROUND((SUM(ST_Length(way::geography))/1000)::numeric, 2) AS total_km
    FROM planet_osm_line
    WHERE waterway IS NOT NULL
    GROUP BY waterway
    ORDER BY count DESC;
  `);

  // 4. Railway Distribution
  await query("Railway Network", `
    SELECT railway, COUNT(*) AS count,
    ROUND((SUM(ST_Length(way::geography))/1000)::numeric, 2) AS total_km
    FROM planet_osm_line
    WHERE railway IS NOT NULL
    GROUP BY railway
    ORDER BY count DESC;
  `);

  // 5. Data Density & Quality (Null counts)
  await query("Tag Coverage & Quality", `
    SELECT 
      COUNT(*) FILTER (WHERE name IS NOT NULL) AS with_name,
      COUNT(*) FILTER (WHERE highway IS NOT NULL) AS with_highway,
      COUNT(*) FILTER (WHERE waterway IS NOT NULL) AS with_waterway,
      COUNT(*) FILTER (WHERE railway IS NOT NULL) AS with_railway,
      COUNT(*) FILTER (WHERE layer IS NOT NULL) AS multi_level_layer
    FROM planet_osm_line;
  `);

  // 6. Network Length Summary
  await query("Global Network Length (Total KM)", `
    SELECT 
      ROUND((SUM(ST_Length(way::geography))/1000)::numeric, 2) AS total_network_km
    FROM planet_osm_line;
  `);

  process.exit(0);
}

analyzeLines();
