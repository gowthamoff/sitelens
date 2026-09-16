-- Geography GiST indexes — the hot analysis queries filter with
--   ST_DWithin(way::geography, <point>::geography, <metres>)
-- which CANNOT use the default geometry index (planet_osm_*_way_idx). Without
-- these, every footfall/proximity/amenity/risk query does a parallel seq scan
-- over the whole table. These expression indexes make them index scans.
--
-- Safe to re-run. Building the polygon index on a large extract takes a couple
-- of minutes (one-time).
CREATE INDEX IF NOT EXISTS idx_point_geog   ON planet_osm_point   USING gist ((way::geography));
CREATE INDEX IF NOT EXISTS idx_line_geog    ON planet_osm_line    USING gist ((way::geography));
CREATE INDEX IF NOT EXISTS idx_polygon_geog ON planet_osm_polygon USING gist ((way::geography));

ANALYZE planet_osm_point;
ANALYZE planet_osm_line;
ANALYZE planet_osm_polygon;
