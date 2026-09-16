"""
Vector tiles served directly from PostGIS — Python port of the "Internal SQL
generation" fallback in server/routes/tiles.js. Martin is dropped; this app runs
ST_AsMVT itself.

The React client requests tiles with Martin's function-source naming and NO .pbf
suffix, e.g.  /tiles/tiles_point/14/11704/7913
(see client/src/components/map/mapLayerConfig.ts). We accept that pattern plus an
optional trailing .pbf, and map the layer name to the right base table.

SRID note: osm2pgsql `-l` stores `way` in EPSG:4326 (which the analysis services
rely on via `way::geography`). ST_AsMVTGeom needs the geometry in the tile's
projection (3857), so we ST_Transform(way, 3857) here, and filter the spatial
index with the envelope transformed back to 4326 (`way && ST_Transform(env,4326)`).
"""
from fastapi import APIRouter, Response
from fastapi.responses import JSONResponse

from .. import db

router = APIRouter(prefix="/tiles")

_PBF_HEADERS = {
    "Cache-Control": "public, max-age=3600",
    "Access-Control-Allow-Origin": "*",
}

_POLYGON_SQL = """
WITH env AS (SELECT ST_TileEnvelope(%(z)s::int, %(x)s::int, %(y)s::int) AS env3857)
SELECT ST_AsMVT(tile, 'osm_polygons', 4096, 'geom') AS mvt FROM (
  SELECT
    osm_id, name, landuse, building, leisure, "natural" AS nat,
    ST_AsMVTGeom(ST_Transform(way, 3857), env.env3857, 4096, 256, true) AS geom
  FROM planet_osm_polygon, env
  WHERE way && ST_Transform(env.env3857, 4326)
    AND (landuse IS NOT NULL OR building IS NOT NULL OR leisure IS NOT NULL OR "natural" IS NOT NULL)
) AS tile;
"""

_LINE_SQL = """
WITH env AS (SELECT ST_TileEnvelope(%(z)s::int, %(x)s::int, %(y)s::int) AS env3857)
SELECT ST_AsMVT(tile, 'osm_lines', 4096, 'geom') AS mvt FROM (
  SELECT
    osm_id, name, highway, waterway, railway,
    ST_AsMVTGeom(ST_Transform(way, 3857), env.env3857, 4096, 256, true) AS geom
  FROM planet_osm_line, env
  WHERE way && ST_Transform(env.env3857, 4326)
    AND (highway IS NOT NULL OR waterway IS NOT NULL OR railway IS NOT NULL)
) AS tile;
"""

_POINT_SQL = """
WITH env AS (SELECT ST_TileEnvelope(%(z)s::int, %(x)s::int, %(y)s::int) AS env3857)
SELECT ST_AsMVT(tile, 'osm_points', 4096, 'geom') AS mvt FROM (
  SELECT
    osm_id, name, amenity, shop, leisure, tourism, highway,
    ST_AsMVTGeom(ST_Transform(way, 3857), env.env3857, 4096, 256, true) AS geom
  FROM planet_osm_point, env
  WHERE way && ST_Transform(env.env3857, 4326)
    AND (amenity IS NOT NULL OR shop IS NOT NULL OR leisure IS NOT NULL OR tourism IS NOT NULL OR highway = 'bus_stop')
) AS tile;
"""


def _sql_for_layer(layer: str):
    # Same routing as tiles.js: substring match on the layer/table name.
    if "polygon" in layer:
        return _POLYGON_SQL
    if "line" in layer:
        return _LINE_SQL
    return _POINT_SQL


def _handle(layer: str, z: str, x: str, y: str):
    try:
        zi, xi, yi = int(z), int(x), int(str(y).replace(".pbf", ""))
        row = db.query_one(_sql_for_layer(layer), {"z": zi, "x": xi, "y": yi})
        tile = row["mvt"] if row else None
        if tile is None or len(bytes(tile)) == 0:
            return Response(status_code=204, headers=_PBF_HEADERS)
        return Response(content=bytes(tile), media_type="application/x-protobuf", headers=_PBF_HEADERS)
    except Exception as e:
        print(f"TILE ERROR: {e}")
        return JSONResponse(status_code=500, content={"error": str(e)})


# Primary pattern used by the client: /tiles/{layer}/{z}/{x}/{y}
@router.get("/{layer}/{z}/{x}/{y}")
def tile_with_layer(layer: str, z: str, x: str, y: str):
    return _handle(layer, z, x, y)


# Legacy fallback: /tiles/{z}/{x}/{y} (layer defaults to points, like the old route).
@router.get("/{z}/{x}/{y}")
def tile_no_layer(z: str, x: str, y: str):
    return _handle("points", z, x, y)
