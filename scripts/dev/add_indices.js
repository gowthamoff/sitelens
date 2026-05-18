const pool = require("../config/db");

async function addIndices() {
  console.log("Adding spatial indices for geographic queries...");
  console.log(
    "This may take 2-5 minutes per table depending on CPU/SSD speed.",
  );

  const tasks = [
    {
      name: "Line Geography",
      sql: "CREATE INDEX IF NOT EXISTS planet_osm_line_geog_gist ON planet_osm_line USING gist ((way::geography))",
    },
    {
      name: "Polygon Geography",
      sql: "CREATE INDEX IF NOT EXISTS planet_osm_polygon_geog_gist ON planet_osm_polygon USING gist ((way::geography))",
    },
    {
      name: "Point (Transform 4326) Geography",
      sql: "CREATE INDEX IF NOT EXISTS planet_osm_point_geog_gist ON planet_osm_point USING gist ((way::geography))",
    },
  ];

  for (const task of tasks) {
    try {
      console.log(`Working on: ${task.name}...`);
      const start = Date.now();
      await pool.query(task.sql);
      console.log(
        `✅ ${task.name} Index created in ${(Date.now() - start) / 1000}s`,
      );
    } catch (err) {
      console.error(`❌ Error on ${task.name}:`, err.message);
    }
  }
  process.exit(0);
}

addIndices();
