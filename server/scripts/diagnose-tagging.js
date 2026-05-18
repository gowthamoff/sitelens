/**
 * Diagnostic: how many features are tagged in a 500 m radius
 * Usage: node scripts/diagnose-tagging.js [lat] [lng] [radius_m]
 */
require('dotenv').config();
const pool = require('../config/db');

const lat    = parseFloat(process.argv[2] || '12.9382');
const lng    = parseFloat(process.argv[3] || '77.5631');
const radius = parseInt(process.argv[4]   || '500');

async function run() {
  console.log(`\n📍 Site: ${lat}, ${lng}  |  Radius: ${radius} m\n`);

  // 1. Detect SRID
  const { rows: sridRows } = await pool.query(
    `SELECT COALESCE(NULLIF(ST_SRID(way), 0), 4326) AS srid FROM planet_osm_polygon LIMIT 1`
  );
  const waySrid = sridRows[0]?.srid ?? 4326;
  console.log(`🗺  planet_osm_polygon SRID: ${waySrid}\n`);

  const bufNative = waySrid === 4326
    ? `ST_Buffer(ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography, ${radius})::geometry`
    : `ST_Transform(ST_Buffer(ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography, ${radius})::geometry, ${waySrid})`;

  // 2. Total polygons in radius
  const { rows: totalRows } = await pool.query(`
    SELECT COUNT(*) AS total,
           ROUND(SUM(ST_Area(way::geography)))::int AS total_area_m2
    FROM planet_osm_polygon
    WHERE ST_Intersects(way, ${bufNative})
  `);
  console.log('━━━ All polygons in radius ━━━━━━━━━━━━━━━━━━');
  console.log(`  Total count : ${totalRows[0].total}`);
  console.log(`  Total area  : ${(totalRows[0].total_area_m2 / 1000).toFixed(1)} k m²`);

  // 3. Breakdown by tag category
  const { rows: tagRows } = await pool.query(`
    SELECT
      CASE
        WHEN building IN ('office','commercial','retail') OR landuse IN ('commercial','retail') OR office IS NOT NULL THEN 'office'
        WHEN building IN ('residential','apartments','house','dormitory') OR landuse = 'residential'                 THEN 'residential'
        WHEN amenity  IN ('college','university','school')                                                          THEN 'college'
        WHEN building = 'yes'                                                                                       THEN 'generic_building'
        WHEN landuse  IS NOT NULL                                                                                   THEN 'other_landuse'
        WHEN amenity  IS NOT NULL                                                                                   THEN 'other_amenity'
        ELSE 'unclassified'
      END AS category,
      COUNT(*)                                            AS count,
      ROUND(SUM(ST_Area(way::geography)))::int            AS area_m2
    FROM planet_osm_polygon
    WHERE ST_Intersects(way, ${bufNative})
    GROUP BY 1
    ORDER BY area_m2 DESC
  `);
  console.log('\n━━━ Breakdown by category ━━━━━━━━━━━━━━━━━━');
  console.log('  Category             Count   Area (k m²)');
  tagRows.forEach(r => {
    console.log(`  ${r.category.padEnd(20)} ${String(r.count).padStart(5)}   ${(r.area_m2/1000).toFixed(1).padStart(10)}`);
  });

  // 4. Top building tags actually present
  const { rows: bldgRows } = await pool.query(`
    SELECT building, COUNT(*) AS n, ROUND(SUM(ST_Area(way::geography)))::int AS area_m2
    FROM planet_osm_polygon
    WHERE ST_Intersects(way, ${bufNative})
      AND building IS NOT NULL
    GROUP BY building
    ORDER BY n DESC
    LIMIT 20
  `);
  console.log('\n━━━ building= tags present ━━━━━━━━━━━━━━━━━');
  console.log('  Tag                  Count   Area (k m²)');
  bldgRows.forEach(r => {
    console.log(`  ${(r.building||'(null)').padEnd(20)} ${String(r.n).padStart(5)}   ${(r.area_m2/1000).toFixed(1).padStart(10)}`);
  });

  // 5. Top landuse tags
  const { rows: luRows } = await pool.query(`
    SELECT landuse, COUNT(*) AS n, ROUND(SUM(ST_Area(way::geography)))::int AS area_m2
    FROM planet_osm_polygon
    WHERE ST_Intersects(way, ${bufNative})
      AND landuse IS NOT NULL
    GROUP BY landuse
    ORDER BY area_m2 DESC
    LIMIT 15
  `);
  console.log('\n━━━ landuse= tags present ━━━━━━━━━━━━━━━━━━');
  console.log('  Tag                  Count   Area (k m²)');
  luRows.forEach(r => {
    console.log(`  ${(r.landuse||'(null)').padEnd(20)} ${String(r.n).padStart(5)}   ${(r.area_m2/1000).toFixed(1).padStart(10)}`);
  });

  // 6. Top amenity tags
  const { rows: amRows } = await pool.query(`
    SELECT amenity, COUNT(*) AS n, ROUND(SUM(ST_Area(way::geography)))::int AS area_m2
    FROM planet_osm_polygon
    WHERE ST_Intersects(way, ${bufNative})
      AND amenity IS NOT NULL
    GROUP BY amenity
    ORDER BY n DESC
    LIMIT 15
  `);
  console.log('\n━━━ amenity= tags present ━━━━━━━━━━━━━━━━━━');
  console.log('  Tag                  Count   Area (k m²)');
  amRows.forEach(r => {
    console.log(`  ${(r.amenity||'(null)').padEnd(20)} ${String(r.n).padStart(5)}   ${(r.area_m2/1000).toFixed(1).padStart(10)}`);
  });

  // 7. Generic building=yes breakdown — what are those buildings actually?
  const { rows: genRows } = await pool.query(`
    SELECT
      COALESCE(shop, tourism, leisure, "natural", historic, man_made, '—') AS other_tag,
      COUNT(*) AS n,
      ROUND(SUM(ST_Area(way::geography)))::int AS area_m2
    FROM planet_osm_polygon
    WHERE ST_Intersects(way, ${bufNative})
      AND building = 'yes'
    GROUP BY 1
    ORDER BY n DESC
    LIMIT 10
  `);
  console.log('\n━━━ building=yes — other tags on those polys ━');
  console.log('  Other tag            Count   Area (k m²)');
  genRows.forEach(r => {
    console.log(`  ${r.other_tag.padEnd(20)} ${String(r.n).padStart(5)}   ${(r.area_m2/1000).toFixed(1).padStart(10)}`);
  });

  // 8. Coverage summary
  const circleArea = Math.PI * radius * radius;
  const tagged = tagRows.filter(r => ['office','residential','college'].includes(r.category));
  const taggedArea = tagged.reduce((s,r) => s + r.area_m2, 0);
  const totalArea  = totalRows[0].total_area_m2;
  console.log('\n━━━ Coverage summary ━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`  500m circle area   : ${(circleArea/1000).toFixed(0)} k m²`);
  console.log(`  Total OSM polygon  : ${(totalArea/1000).toFixed(1)} k m²  (${(totalArea/circleArea*100).toFixed(1)}% of circle)`);
  console.log(`  Our tagged area    : ${(taggedArea/1000).toFixed(1)} k m²  (${(taggedArea/circleArea*100).toFixed(1)}% of circle)`);
  console.log(`  ⚠ Untagged / missing: ${((circleArea-totalArea)/1000).toFixed(0)} k m² (${((1-totalArea/circleArea)*100).toFixed(1)}%)`);

  console.log('\n━━━ Recommendation ━━━━━━━━━━━━━━━━━━━━━━━━━');
  const genericCount = tagRows.find(r => r.category === 'generic_building')?.count ?? 0;
  if (genericCount > 0) {
    console.log(`  ${genericCount} generic building=yes polygons could be classified`);
    console.log(`  by adding shop/office/amenity tags in OSM, or by enriching`);
    console.log(`  the query to use building=yes as a residential proxy.`);
  }
  const unclassified = tagRows.find(r => r.category === 'unclassified')?.count ?? 0;
  if (unclassified > 0) {
    console.log(`  ${unclassified} polygons have no building/landuse/amenity tag at all.`);
  }

  await pool.end();
}

run().catch(err => { console.error(err); process.exit(1); });
