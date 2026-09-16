"""Port of server/routes/demand-mix.js — requires auth."""
from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse

from .. import db
from ..auth import require_auth

router = APIRouter(prefix="/api", dependencies=[Depends(require_auth)])


@router.get("/demand-mix")
def demand_mix(lat: str = None, lng: str = None, radius: str = "500"):
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

    sql = """
    WITH site AS (
      SELECT ST_Buffer(ST_SetSRID(ST_MakePoint(%(lng)s, %(lat)s), 4326)::geography, %(radius)s)::geometry AS buf
    ),
    valid_polys AS (
      SELECT way, building, landuse, office, amenity
      FROM planet_osm_polygon, site
      WHERE ST_Intersects(way, site.buf)
        AND ST_Area(way::geography) < 5000000
    ),
    office AS (
      SELECT COALESCE(SUM(ST_Area(way::geography)), 0) AS area
      FROM valid_polys
      WHERE building IN ('office','commercial','retail')
         OR landuse  IN ('commercial','retail')
         OR office   IS NOT NULL
    ),
    residential AS (
      SELECT COALESCE(SUM(ST_Area(way::geography)), 0) AS area
      FROM valid_polys
      WHERE building IN ('residential','apartments','house','dormitory','yes')
         OR landuse = 'residential'
    ),
    college AS (
      SELECT COALESCE(SUM(ST_Area(way::geography)), 0) AS area
      FROM valid_polys
      WHERE amenity IN ('college','university','school')
         OR building = 'college'
    ),
    transit AS (
      SELECT COUNT(*) * 2000 AS area
      FROM planet_osm_point, site
      WHERE ST_Intersects(way, site.buf)
        AND (public_transport = 'station'
             OR railway       = 'station'
             OR highway       = 'bus_stop'
             OR amenity       = 'bus_station')
    )
    SELECT
      ROUND(office.area)      AS office_m2,
      ROUND(residential.area) AS residential_m2,
      ROUND(college.area)     AS college_m2,
      transit.area            AS transit_m2
    FROM office, residential, college, transit;
    """
    try:
        r = db.query_one(sql, {"lng": lng_f, "lat": lat_f, "radius": radius_i})
    except Exception as e:
        print(f"[DemandMix] {e}")
        return JSONResponse(status_code=500, content={"error": "demand-mix query failed"})

    office_m2 = db.num(r["office_m2"])
    residential_m2 = db.num(r["residential_m2"])
    college_m2 = db.num(r["college_m2"])
    transit_m2 = db.num(r["transit_m2"])

    total = office_m2 + residential_m2 + college_m2 + transit_m2
    if total == 0:
        mix = {"office": 0, "residential": 0, "college": 0, "transit": 0}
    else:
        mix = {
            "office": round(office_m2 / total * 100),
            "residential": round(residential_m2 / total * 100),
            "college": round(college_m2 / total * 100),
            "transit": round(transit_m2 / total * 100),
        }

    return {
        "site": {"lat": lat_f, "lng": lng_f, "radius_m": radius_i},
        "raw_areas_m2": {
            "office_m2": office_m2, "residential_m2": residential_m2,
            "college_m2": college_m2, "transit_m2": transit_m2,
        },
        "mix_pct": mix,
        "profile": _classify_profile(mix),
        "peak_pattern": _predict_peaks(mix),
    }


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


def _classify_profile(m):
    top = sorted(m.items(), key=lambda kv: kv[1], reverse=True)[0]
    if top[1] < 30:
        return "mixed"
    return f"{top[0]}_dominant"


def _predict_peaks(m):
    peaks = []
    if m["office"] >= 25:
        peaks += ["10:30–11:30 AM (office break)", "4–5 PM (evening break)"]
    if m["college"] >= 25:
        peaks += ["1–2 PM (lunch break)", "4–7 PM (post-class hangout)"]
    if m["residential"] >= 25:
        peaks += ["6–8 AM (breakfast chai)", "6–9 PM (evening social)"]
    if m["transit"] >= 20:
        peaks += ["7–10 AM (morning commute)", "5–8 PM (return commute)"]
    if not peaks:
        peaks.append("Insufficient demand drivers in walking radius")
    return list(dict.fromkeys(peaks))  # de-dup, preserve order
