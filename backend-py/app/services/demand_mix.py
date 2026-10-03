"""Demand-mix: land-use area shares around a site and the footfall peaks they imply."""
from .. import db


def demand_mix(lat, lng, radius):
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
    r = db.query_one(sql, {"lng": lng, "lat": lat, "radius": radius})

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
        "site": {"lat": lat, "lng": lng, "radius_m": radius},
        "raw_areas_m2": {
            "office_m2": office_m2, "residential_m2": residential_m2,
            "college_m2": college_m2, "transit_m2": transit_m2,
        },
        "mix_pct": mix,
        "profile": _classify_profile(mix),
        "peak_pattern": _predict_peaks(mix),
    }


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
