const pool = require("../config/db");
pool.query("SELECT ST_SRID(way) FROM planet_osm_point LIMIT 1").then((r) => {
  console.log("SRID is:", r.rows[0].st_srid);
  process.exit(0);
});
