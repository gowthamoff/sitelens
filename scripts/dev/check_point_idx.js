async function check() {
  const res = await pool.query(`
    SELECT tablename, indexname, indexdef FROM pg_indexes 
    WHERE tablename IN ('planet_osm_point', 'planet_osm_line', 'planet_osm_polygon')
    ORDER BY tablename, indexname;
  `);
  console.table(res.rows);
  process.exit(0);
}
check();
