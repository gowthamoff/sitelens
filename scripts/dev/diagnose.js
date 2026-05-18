const pool = require("./config/db");

async function fullDiagnostic() {
  const run = async (label, sql, params = []) => {
    try {
      const r = await pool.query(sql, params);
      console.log(`\n✅ ${label}:`);
      console.log(JSON.stringify(r.rows.slice(0, 8), null, 2));
    } catch (e) {
      console.error(`\n❌ ${label}: ${e.message}`);
    }
  };

  // 1. Check SRID & geometry type per table
  await run("SRID & Geometry types", `
    SELECT f_table_name, f_geometry_column, srid, type
    FROM geometry_columns
    WHERE f_table_name LIKE 'planet_osm%'
    ORDER BY f_table_name;
  `);

  // 2. Row counts
  await run("Row counts", `
    SELECT 
      (SELECT COUNT(*) FROM planet_osm_point)   AS points,
      (SELECT COUNT(*) FROM planet_osm_line)    AS lines,
      (SELECT COUNT(*) FROM planet_osm_polygon) AS polygons,
      (SELECT COUNT(*) FROM planet_osm_roads)   AS roads;
  `);

  // 3. Highway types available in lines
  await run("Highway types in planet_osm_line (top 15)", `
    SELECT highway, COUNT(*) as cnt
    FROM planet_osm_line
    WHERE highway IS NOT NULL
    GROUP BY highway ORDER BY cnt DESC LIMIT 15;
  `);

  // 4. Landuse types in polygons
  await run("Landuse types in planet_osm_polygon (top 15)", `
    SELECT landuse, COUNT(*) as cnt
    FROM planet_osm_polygon
    WHERE landuse IS NOT NULL
    GROUP BY landuse ORDER BY cnt DESC LIMIT 15;
  `);

  // 5. Building types in polygons
  await run("Building types in planet_osm_polygon (top 10)", `
    SELECT building, COUNT(*) as cnt
    FROM planet_osm_polygon
    WHERE building IS NOT NULL AND building <> 'no'
    GROUP BY building ORDER BY cnt DESC LIMIT 10;
  `);

  // 6. Amenity types in points (top 20)
  await run("Amenity types in planet_osm_point (top 20)", `
    SELECT amenity, COUNT(*) as cnt
    FROM planet_osm_point
    WHERE amenity IS NOT NULL
    GROUP BY amenity ORDER BY cnt DESC LIMIT 20;
  `);

  // 7. Shop types in points (top 15)
  await run("Shop types in planet_osm_point (top 15)", `
    SELECT shop, COUNT(*) as cnt
    FROM planet_osm_point
    WHERE shop IS NOT NULL
    GROUP BY shop ORDER BY cnt DESC LIMIT 15;
  `);

  // 8. Natural types in polygons
  await run("Natural types in planet_osm_polygon (top 10)", `
    SELECT "natural", COUNT(*) AS cnt
    FROM planet_osm_polygon
    WHERE "natural" IS NOT NULL
    GROUP BY "natural" ORDER BY cnt DESC LIMIT 10;
  `);

  // 9. Test: raw bbox check — does any line exist near Bangalore?
  await run("Raw line count near Bangalore (BBOX, no transform)", `
    SELECT COUNT(*) as cnt
    FROM planet_osm_line
    WHERE way && ST_MakeEnvelope(8637000, 1444000, 8641000, 1447000, 3857);
  `);

  // 10. Test: raw polygon count near Bangalore
  await run("Raw polygon count near Bangalore (BBOX, no transform)", `
    SELECT COUNT(*) as cnt
    FROM planet_osm_polygon
    WHERE way && ST_MakeEnvelope(8637000, 1444000, 8641000, 1447000, 3857);
  `);

  // 11. Sample waterway data
  await run("Waterway types in planet_osm_line (top 10)", `
    SELECT waterway, COUNT(*) as cnt
    FROM planet_osm_line
    WHERE waterway IS NOT NULL
    GROUP BY waterway ORDER BY cnt DESC LIMIT 10;
  `);

  // 12. Leisure types in polygons
  await run("Leisure types in planet_osm_polygon (top 10)", `
    SELECT leisure, COUNT(*) as cnt
    FROM planet_osm_polygon
    WHERE leisure IS NOT NULL
    GROUP BY leisure ORDER BY cnt DESC LIMIT 10;
  `);

  // 13. planet_osm_roads highway types
  await run("Highway types in planet_osm_roads (top 10)", `
    SELECT highway, COUNT(*) as cnt
    FROM planet_osm_roads
    WHERE highway IS NOT NULL
    GROUP BY highway ORDER BY cnt DESC LIMIT 10;
  `);

  // 14. Railways
  await run("Railway types in planet_osm_line (top 10)", `
    SELECT railway, COUNT(*) as cnt
    FROM planet_osm_line
    WHERE railway IS NOT NULL
    GROUP BY railway ORDER BY cnt DESC LIMIT 10;
  `);

  // 15. Place types
  await run("Place types in planet_osm_point (top 10)", `
    SELECT place, COUNT(*) as cnt
    FROM planet_osm_point
    WHERE place IS NOT NULL
    GROUP BY place ORDER BY cnt DESC LIMIT 10;
  `);

  process.exit(0);
}

fullDiagnostic().catch((e) => { console.error(e); process.exit(1); });
