-- Partial GIST indexes for demand-mix and cannibalization queries
-- Run once on the database. Safe to re-run (IF NOT EXISTS).

CREATE INDEX IF NOT EXISTS idx_polygon_office_gist
  ON planet_osm_polygon USING GIST (way)
  WHERE building IN ('office','commercial','retail') OR office IS NOT NULL OR landuse IN ('commercial','retail');

CREATE INDEX IF NOT EXISTS idx_polygon_residential_gist
  ON planet_osm_polygon USING GIST (way)
  WHERE building IN ('residential','apartments','house','dormitory') OR landuse='residential';

CREATE INDEX IF NOT EXISTS idx_polygon_education_gist
  ON planet_osm_polygon USING GIST (way)
  WHERE amenity IN ('college','university','school');

CREATE INDEX IF NOT EXISTS idx_point_transit_gist
  ON planet_osm_point USING GIST (way)
  WHERE public_transport='station' OR railway='station' OR highway='bus_stop' OR amenity='bus_station';

ANALYZE planet_osm_polygon;
ANALYZE planet_osm_point;
