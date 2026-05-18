-- ============================================================
--  SiteLens Geocoding Migration
--  Run once on your PostGIS database that contains OSM data.
--  Requires: PostGIS, pg_trgm extension
-- ============================================================

-- 1. Enable fuzzy-search extension
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- 2. Build the unified geocode_places materialized view
DROP MATERIALIZED VIEW IF EXISTS geocode_places;

CREATE MATERIALIZED VIEW geocode_places AS

-- Named POIs (restaurants, hospitals, schools, shops…)
SELECT
  osm_id,
  name,
  COALESCE(amenity, shop, tourism, leisure, office) AS place_type,
  'poi' AS category,
  ST_Centroid(way)::geography AS geog,
  ST_Centroid(way)             AS geom
FROM planet_osm_point
WHERE name IS NOT NULL AND name != ''

UNION ALL

-- Named areas (neighbourhoods, suburbs, admin boundaries, land use)
SELECT
  osm_id,
  name,
  COALESCE(place, admin_level, landuse) AS place_type,
  'area' AS category,
  ST_Centroid(way)::geography AS geog,
  ST_Centroid(way)             AS geom
FROM planet_osm_polygon
WHERE name IS NOT NULL AND name != ''
  AND (
    place IS NOT NULL
    OR admin_level IS NOT NULL
    OR landuse IS NOT NULL
    OR boundary = 'administrative'
  )

UNION ALL

-- Named roads / streets
SELECT
  osm_id,
  name,
  highway AS place_type,
  'road' AS category,
  ST_Centroid(way)::geography AS geog,
  ST_Centroid(way)             AS geom
FROM planet_osm_line
WHERE name IS NOT NULL AND name != ''
  AND highway IS NOT NULL;

-- 3. Create indexes for high-performance fuzzy lookup and spatial proximity
-- We use GiST for names to support the <-> distance operator for instant Top-N sorting
DROP INDEX IF EXISTS idx_geocode_name_trgm;
CREATE INDEX idx_geocode_name_gist ON geocode_places USING GIST (name gist_trgm_ops);
CREATE INDEX idx_geocode_geog      ON geocode_places USING GIST(geog);

-- 4. Physical Optimization (Crucial for performance)
-- Physically reorder the table on disk to match the name index. 
-- This turns random disk IO into sequential IO, drastically speeding up search.
CLUSTER geocode_places USING idx_geocode_name_gist;
ANALYZE geocode_places;

-- 4. Refresh command (run periodically or after OSM data import):
--    REFRESH MATERIALIZED VIEW CONCURRENTLY geocode_places;
