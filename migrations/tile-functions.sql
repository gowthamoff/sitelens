-- SiteLens — Martin tile function sources (zoom-tiered, client-compatible)
--
-- Strategy: low zoom serves from the small, pre-projected (3857), simplified
-- mv_tiles_*_low views; high zoom serves from the raw planet_osm_* tables (tiny
-- envelopes → index-bound, reprojection cheap). This eliminates the low-zoom
-- full-table scan + per-row reproject that made a single z10 tile take ~63 s
-- (measured) — the MV path serves the same tile in ~0.29 s.
--
-- IMPORTANT — drop-in compatibility with the MapLibre style:
--   * ST_AsMVT layer name MUST equal the table name the client uses as
--     'source-layer' (planet_osm_polygon / planet_osm_line / planet_osm_point).
--   * The emitted properties MUST match the columns the client filters on
--     (admin_level, place, natural, landuse, water, leisure, building, name /
--      highway, railway, waterway / amenity, shop, place).
-- With this, the only client change is the source `tiles:` URL.
--
-- Zoom thresholds mirror the client's source minzooms:
--   polygon: MV at z<=12, raw at z>=13   (buildings appear z15 via raw)
--   line:    MV at z<=11, raw at z>=12   (full road detail from z12 via raw)
--   point:   MV at z<=12, raw at z>=13   (POIs appear z15 via raw)
--
-- Apply: psql -h localhost -p 5400 -U <user> -d osm-tn -f migrations/tile-functions.sql

-- ---- POLYGONS ----
CREATE OR REPLACE FUNCTION public.tiles_polygon(z integer, x integer, y integer)
RETURNS bytea
LANGUAGE plpgsql STABLE PARALLEL SAFE AS $$
DECLARE
  env geometry := ST_TileEnvelope(z, x, y);   -- 3857
  mvt bytea;
BEGIN
  IF z <= 12 THEN
    SELECT ST_AsMVT(t, 'planet_osm_polygon') INTO mvt FROM (
      SELECT name, admin_level, place, "natural", landuse, water, leisure,
             ST_AsMVTGeom(geom, env, 4096, 64, true) AS geom
      FROM mv_tiles_polygon_low
      WHERE geom && env
    ) t WHERE t.geom IS NOT NULL;
  ELSE
    SELECT ST_AsMVT(t, 'planet_osm_polygon') INTO mvt FROM (
      SELECT name, admin_level, place, "natural", landuse, water, leisure, building,
             ST_AsMVTGeom(ST_Transform(way, 3857), env, 4096, 64, true) AS geom
      FROM planet_osm_polygon
      WHERE way && ST_Transform(env, 4326)
        AND (building IS NOT NULL OR landuse IS NOT NULL OR "natural" IS NOT NULL
             OR leisure IS NOT NULL OR water IS NOT NULL OR place IS NOT NULL
             OR admin_level IS NOT NULL OR boundary = 'administrative')
    ) t WHERE t.geom IS NOT NULL;
  END IF;
  RETURN mvt;
END;
$$;

-- ---- LINES ----
CREATE OR REPLACE FUNCTION public.tiles_line(z integer, x integer, y integer)
RETURNS bytea
LANGUAGE plpgsql STABLE PARALLEL SAFE AS $$
DECLARE
  env geometry := ST_TileEnvelope(z, x, y);
  mvt bytea;
BEGIN
  IF z <= 11 THEN
    SELECT ST_AsMVT(t, 'planet_osm_line') INTO mvt FROM (
      SELECT name, highway, railway, waterway,
             ST_AsMVTGeom(geom, env, 4096, 64, true) AS geom
      FROM mv_tiles_line_low
      WHERE geom && env
    ) t WHERE t.geom IS NOT NULL;
  ELSE
    SELECT ST_AsMVT(t, 'planet_osm_line') INTO mvt FROM (
      SELECT name, highway, railway, waterway,
             ST_AsMVTGeom(ST_Transform(way, 3857), env, 4096, 64, true) AS geom
      FROM planet_osm_line
      WHERE way && ST_Transform(env, 4326)
        AND (highway IS NOT NULL OR waterway IS NOT NULL OR railway IS NOT NULL)
    ) t WHERE t.geom IS NOT NULL;
  END IF;
  RETURN mvt;
END;
$$;

-- ---- POINTS ----
CREATE OR REPLACE FUNCTION public.tiles_point(z integer, x integer, y integer)
RETURNS bytea
LANGUAGE plpgsql STABLE PARALLEL SAFE AS $$
DECLARE
  env geometry := ST_TileEnvelope(z, x, y);
  mvt bytea;
BEGIN
  IF z <= 12 THEN
    SELECT ST_AsMVT(t, 'planet_osm_point') INTO mvt FROM (
      SELECT name, place,
             ST_AsMVTGeom(geom, env, 4096, 64, true) AS geom
      FROM mv_tiles_point_low
      WHERE geom && env
    ) t WHERE t.geom IS NOT NULL;
  ELSE
    SELECT ST_AsMVT(t, 'planet_osm_point') INTO mvt FROM (
      SELECT name, amenity, shop, place,
             ST_AsMVTGeom(ST_Transform(way, 3857), env, 4096, 64, true) AS geom
      FROM planet_osm_point
      WHERE way && ST_Transform(env, 4326)
        AND (amenity IS NOT NULL OR shop IS NOT NULL OR place IS NOT NULL)
    ) t WHERE t.geom IS NOT NULL;
  END IF;
  RETURN mvt;
END;
$$;
