"""Port of server/routes/demand-mix.js — requires auth."""
from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse
from pydantic import ValidationError

from .. import db
from ..auth import require_auth
from ..common import PlainError
from ..schemas.site import DemandMixQuery, demand_mix_error_message
from ..services.demand_mix import demand_mix as demand_mix_service

router = APIRouter(prefix="/api", dependencies=[Depends(require_auth)])


def _demand_mix_query(lat: str = None, lng: str = None, radius: str = "500") -> DemandMixQuery:
    try:
        return DemandMixQuery(lat=lat, lng=lng, radius=radius)
    except ValidationError as e:
        raise PlainError(demand_mix_error_message(e), 400)


@router.get("/demand-mix")
def demand_mix(q: DemandMixQuery = Depends(_demand_mix_query)):
    try:
        return demand_mix_service(q.lat, q.lng, q.radius)
    except Exception as e:
        print(f"[DemandMix] {e}")
        return JSONResponse(status_code=500, content={"error": "demand-mix query failed"})


@router.get("/demand-mix-geo")
def demand_mix_geo(lat: str = None, lng: str = None, radius: str = "500"):
    try:
        lat_f, lng_f = float(lat), float(lng)
    except (TypeError, ValueError):
        return JSONResponse(status_code=400, content={"error": "lat/lng required"})
    try:
        radius_i = int(float(radius or "500"))
    except (TypeError, ValueError):
        radius_i = 500
    if radius_i < 100 or radius_i > 5000:
        return JSONResponse(status_code=400, content={"error": "radius must be 100–5000 m"})

    try:
        srid_row = db.query_one(
            "SELECT COALESCE(NULLIF(ST_SRID(way), 0), 4326) AS srid FROM planet_osm_polygon LIMIT 1"
        )
        way_srid = (srid_row or {}).get("srid") or 4326

        sql = """
        WITH site AS (
          SELECT
            ST_Buffer(ST_SetSRID(ST_MakePoint(%(lng)s, %(lat)s), 4326)::geography, %(radius)s)::geometry AS buf_4326,
            ST_Transform(
              ST_Buffer(ST_SetSRID(ST_MakePoint(%(lng)s, %(lat)s), 4326)::geography, %(radius)s)::geometry,
              %(srid)s::int
            ) AS buf_native
        ),
        polys_raw AS (
          SELECT
            ST_CollectionExtract(
              ST_Intersection(ST_SetSRID(way, %(srid)s::int), site.buf_native),
              3
            ) AS clipped,
            CASE
              WHEN building IN ('office','commercial','retail')
                OR landuse  IN ('commercial','retail')
                OR office IS NOT NULL                                         THEN 'office'
              WHEN building IN ('residential','apartments','house','dormitory','yes')
                OR landuse = 'residential'                                    THEN 'residential'
              WHEN amenity IN ('college','university','school')
                OR building = 'college'                                       THEN 'college'
            END AS zone_type
          FROM planet_osm_polygon, site
          WHERE ST_Intersects(way, site.buf_native)
            AND ST_IsValid(way)
            AND ST_Area(way::geography) < 5000000
            AND (
              building IN ('office','commercial','retail',
                           'residential','apartments','house','dormitory','yes')
              OR landuse  IN ('commercial','retail','residential')
              OR office   IS NOT NULL
              OR amenity  IN ('college','university','school')
              OR building = 'college'
            )
        ),
        polys AS (
          SELECT ST_AsGeoJSON(ST_Transform(clipped, 4326))::json AS geom, zone_type
          FROM polys_raw
          WHERE zone_type IS NOT NULL
            AND clipped IS NOT NULL
            AND NOT ST_IsEmpty(clipped)
        ),
        pts AS (
          SELECT
            ST_AsGeoJSON(ST_Transform(ST_SetSRID(way, %(srid)s::int), 4326))::json AS geom,
            'transit'                                                          AS zone_type
          FROM planet_osm_point, site
          WHERE ST_Intersects(way, site.buf_native)
            AND (public_transport = 'station' OR railway    = 'station'
                 OR highway       = 'bus_stop' OR amenity  = 'bus_station')
        )
        SELECT geom, zone_type FROM polys WHERE geom IS NOT NULL
        UNION ALL
        SELECT geom, zone_type FROM pts   WHERE geom IS NOT NULL
        LIMIT 3000;
        """
        rows = db.query(sql, {"lng": lng_f, "lat": lat_f, "radius": radius_i, "srid": int(way_srid)})
    except Exception as e:
        print(f"[DemandMixGeo] {e}")
        return JSONResponse(status_code=500, content={"error": "demand-mix-geo query failed", "detail": str(e)})

    features = [
        {"type": "Feature", "geometry": db.parse_geojson(r["geom"]), "properties": {"zone_type": r["zone_type"]}}
        for r in rows
    ]
    print(f"[DemandMixGeo] {len(features)} features at ({lat_f},{lng_f}) r={radius_i} waySrid={way_srid}")
    return {"type": "FeatureCollection", "features": features}

