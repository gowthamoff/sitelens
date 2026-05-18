const pool = require("../config/db");

async function checkPerformance() {
  console.log("Checking DB indices...");
  try {
    const res = await pool.query(`
      SELECT tablename, indexname, indexdef 
      FROM pg_indexes 
      WHERE tablename IN ('planet_osm_point', 'planet_osm_line', 'planet_osm_polygon');
    `);
    console.table(res.rows);

    console.log("\nTesting 10km Geography Search Speed (Lines)...");
    const start = Date.now();
    await pool.query(`
      SELECT COUNT(*) FROM planet_osm_line 
      WHERE ST_DWithin(way::geography, ST_SetSRID(ST_Point(77.59, 12.97), 4326)::geography, 10000);
    `);
    console.log(`Geography Speed: ${Date.now() - start}ms`);

    console.log("\nTesting 10km Geometry Search Speed (Lines)...");
    const startGeo = Date.now();
    await pool.query(`
      SELECT COUNT(*) FROM planet_osm_line 
      WHERE way && ST_Expand(ST_SetSRID(ST_Point(77.59, 12.97), 4326), 10000/111320.0);
    `);
    console.log(`Geometry Speed: ${Date.now() - startGeo}ms`);
  } catch (err) {
    console.error("Performance error:", err.message);
  }
  process.exit(0);
}

checkPerformance();
