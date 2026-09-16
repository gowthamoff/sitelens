-- SiteLens — low-zoom tile materialized views (schema-compatible with the client)
-- These carry the SAME tag columns the MapLibre style filters on
-- (client/src/components/map/mapLayerConfig.ts), pre-projected to 3857 and
-- simplified, so the tiles_*() functions can serve them as drop-in replacements
-- for Martin's raw-table auto-sources. Layer/property names must match the client.
--
-- Apply: psql -h localhost -p 5400 -U <user> -d osm-tn -f migrations/tile-mvs.sql

-- ---- POLYGONS (admin boundaries, water, landuse, natural, leisure, places) ----
-- Buildings are intentionally excluded (z15+ served from the raw table).
DROP MATERIALIZED VIEW IF EXISTS mv_tiles_polygon_low CASCADE;
CREATE MATERIALIZED VIEW mv_tiles_polygon_low AS
SELECT osm_id, name, admin_level, place, "natural", landuse, water, leisure,
       ST_SimplifyPreserveTopology(ST_Transform(way, 3857), 50) AS geom
FROM planet_osm_polygon
WHERE boundary = 'administrative'
   OR admin_level IS NOT NULL OR place IS NOT NULL
   OR landuse IS NOT NULL OR "natural" IS NOT NULL
   OR leisure IS NOT NULL OR water IS NOT NULL;
CREATE INDEX mv_tiles_polygon_low_gix ON mv_tiles_polygon_low USING gist (geom);
ANALYZE mv_tiles_polygon_low;

-- ---- LINES (major roads, railways, waterways) ----
DROP MATERIALIZED VIEW IF EXISTS mv_tiles_line_low CASCADE;
CREATE MATERIALIZED VIEW mv_tiles_line_low AS
SELECT osm_id, name, highway, railway, waterway,
       ST_Simplify(ST_Transform(way, 3857), 50) AS geom
FROM planet_osm_line
WHERE highway IN ('motorway','trunk','primary','secondary')
   OR railway IS NOT NULL
   OR waterway IS NOT NULL;
CREATE INDEX mv_tiles_line_low_gix ON mv_tiles_line_low USING gist (geom);
ANALYZE mv_tiles_line_low;

-- ---- POINTS (place names; POIs are z15+ via the raw table) ----
DROP MATERIALIZED VIEW IF EXISTS mv_tiles_point_low CASCADE;
CREATE MATERIALIZED VIEW mv_tiles_point_low AS
SELECT osm_id, name, place,
       ST_Transform(way, 3857) AS geom
FROM planet_osm_point
WHERE place IS NOT NULL;
CREATE INDEX mv_tiles_point_low_gix ON mv_tiles_point_low USING gist (geom);
ANALYZE mv_tiles_point_low;

SELECT matviewname, pg_size_pretty(pg_total_relation_size('public.'||matviewname)) AS size
FROM pg_matviews WHERE matviewname LIKE 'mv_tiles_%' ORDER BY 1;
