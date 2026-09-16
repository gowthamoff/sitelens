-- Builds the geocode_places table the /api/v1/geocode routes query.
-- (The original docs/geocode_migration.sql was lost; this recreates it from the
-- freshly-loaded OSM tables.) Safe to re-run.
--
-- Columns expected by the route: name, place_type, category, geom (point), geog.
-- `category` drives ranking: 'area' > 'road' > everything else.

DROP TABLE IF EXISTS geocode_places;

CREATE TABLE geocode_places AS
-- Named places & POIs (points)
SELECT
  name,
  COALESCE(place, 'place')                        AS place_type,
  CASE
    WHEN place IN ('city','town','village','suburb','neighbourhood',
                   'hamlet','locality','quarter','borough') THEN 'area'
    ELSE 'poi'
  END                                             AS category,
  ST_Transform(way, 4326)                         AS geom,
  ST_Transform(way, 4326)::geography              AS geog
FROM planet_osm_point
WHERE name IS NOT NULL
  AND (place IS NOT NULL OR amenity IS NOT NULL OR shop IS NOT NULL OR tourism IS NOT NULL)

UNION ALL
-- Named roads (lines) — use the centroid as the searchable point
SELECT
  name,
  'road'                                          AS place_type,
  'road'                                          AS category,
  ST_Transform(ST_Centroid(way), 4326)            AS geom,
  ST_Transform(ST_Centroid(way), 4326)::geography AS geog
FROM planet_osm_line
WHERE name IS NOT NULL AND highway IS NOT NULL;

-- Indexes for fuzzy name search (pg_trgm) and nearest-point (reverse geocode).
CREATE INDEX geocode_places_name_trgm ON geocode_places USING gin (name gin_trgm_ops);
CREATE INDEX geocode_places_geom_gix  ON geocode_places USING gist (geom);
CREATE INDEX geocode_places_geog_gix  ON geocode_places USING gist (geog);
