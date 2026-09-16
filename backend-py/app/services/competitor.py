"""Port of server/services/competitorService.js."""
import math

from .. import db
from ..util import gather
from .google_places import fetch_google_places, merge_osm_with_google

VALID_TYPES = ["restaurant", "pharmacy", "grocery", "clinic", "hospital",
               "education", "fitness", "bank", "hotel", "tea"]


def business_type_sql(param, table_alias=""):
    """SQL CASE that resolves a business_type param to OSM tag predicates.

    `param` is a placeholder string injected into the SQL (e.g. '%(business_type)s').
    """
    p = f"{table_alias}." if table_alias else ""
    return f"""
    CASE
      WHEN {param} = 'restaurant' THEN
        {p}amenity IN ('restaurant','fast_food','cafe','food_court','ice_cream','biergarten')
      WHEN {param} = 'pharmacy' THEN
        {p}amenity = 'pharmacy' OR {p}shop IN ('chemist','medical_supply')
      WHEN {param} = 'grocery' THEN
        {p}shop IN ('supermarket','convenience','grocery','general','wholesale')
      WHEN {param} = 'clinic' THEN
        {p}amenity IN ('clinic','doctors','dentist','veterinary')
      WHEN {param} = 'hospital' THEN
        {p}amenity = 'hospital'
      WHEN {param} = 'education' THEN
        {p}amenity IN ('school','college','university','training')
      WHEN {param} = 'fitness' THEN
        {p}leisure IN ('fitness_centre','sports_centre') OR {p}shop = 'sports'
      WHEN {param} = 'bank' THEN
        {p}amenity IN ('bank','atm')
      WHEN {param} = 'hotel' THEN
        {p}tourism IN ('hotel','motel','hostel','guest_house')
      WHEN {param} = 'tea' THEN
        {p}amenity IN ('cafe','tea','tea_shop') OR {p}shop IN ('tea','coffee')
      ELSE false
    END
    """


_ROAD_TYPE_MAP = {
    "trunk": "National Highway", "motorway": "Expressway",
    "primary": "State Highway", "secondary": "District Road",
    "tertiary": "Local Road", "residential": "Residential Street",
    "service": "Service Lane", "unclassified": "Unclassified",
}


def format_road_type(t):
    return _ROAD_TYPE_MAP.get(t, t or "Unknown")


def competitor_analysis(params):
    lng, lat, radius = params["lng"], params["lat"], params["radius"]
    business_type = params.get("business_type", "restaurant")
    effective_radius = min(radius, 3000)

    sql = f"""
    WITH site AS (
      SELECT ST_SetSRID(ST_MakePoint(%(lng)s, %(lat)s), 4326)::geography AS geog
    ),
    competitors AS (
      SELECT
        p.osm_id, p.name, p.amenity, p.shop, p.tourism, p.leisure, p.office,
        ST_X(ST_Transform(p.way, 4326)) AS lng,
        ST_Y(ST_Transform(p.way, 4326)) AS lat,
        ST_Distance(p.way::geography, s.geog) AS distance_m
      FROM planet_osm_point p, site s
      WHERE ({business_type_sql("%(business_type)s")})
        AND ST_DWithin(p.way::geography, s.geog, %(eff_radius)s)
        AND p.name IS NOT NULL
      ORDER BY distance_m ASC
      LIMIT 50
    )
    SELECT
      c.*,
      (
        SELECT l.highway
        FROM planet_osm_line l
        WHERE l.highway IS NOT NULL
          AND ST_DWithin(
            l.way::geography,
            ST_SetSRID(ST_MakePoint(c.lng, c.lat), 4326)::geography,
            60
          )
        ORDER BY ST_Distance(l.way::geography, ST_SetSRID(ST_MakePoint(c.lng, c.lat), 4326)::geography)
        LIMIT 1
      ) AS road_type,
      (
        SELECT EXISTS (
          SELECT 1 FROM planet_osm_line bl
          WHERE (
            bl.railway IN ('rail','narrow_gauge','subway')
            OR bl.waterway IN ('river','canal')
            OR bl.highway IN ('motorway','trunk')
          )
          AND ST_Intersects(
            bl.way,
            ST_Transform(
              ST_MakeLine(
                ST_SetSRID(ST_MakePoint(%(lng)s, %(lat)s), 4326),
                ST_SetSRID(ST_MakePoint(c.lng, c.lat), 4326)
              ),
              3857
            )
          )
        )
      ) AS has_barrier
    FROM competitors c;
    """
    qp = {"lng": lng, "lat": lat, "business_type": business_type, "eff_radius": effective_radius}

    rows, google_places = gather(
        lambda: db.query(sql, qp),
        lambda: fetch_google_places(lat, lng, effective_radius, business_type),
    )

    def sub_type_of(r):
        return r.get("amenity") or r.get("shop") or r.get("tourism") or r.get("leisure") or r.get("office") or "other"

    osm_list = [{
        "osm_id": r["osm_id"],
        "name": r["name"],
        "distance_m": round(db.num(r["distance_m"])),
        "road_type": r["road_type"],
        "road_label": format_road_type(r["road_type"]),
        "has_barrier": r["has_barrier"],
        "sub_type": sub_type_of(r),
        "lng": db.num(r["lng"]),
        "lat": db.num(r["lat"]),
        "rating": None, "review_count": None, "open_now": None,
        "hours": [], "price_level": None, "address": None, "source": "osm",
    } for r in rows]

    merged_list = merge_osm_with_google(osm_list, google_places, lat, lng)

    google_only = sum(1 for r in merged_list if r["source"] == "google")
    enriched = sum(1 for r in merged_list if r["source"] == "osm+google")

    summary = {
        "total_count": len(merged_list),
        "nearest_m": merged_list[0]["distance_m"] if merged_list else None,
        "farthest_m": merged_list[-1]["distance_m"] if merged_list else None,
        "with_barrier": sum(1 for r in merged_list if r.get("has_barrier")),
        "on_main_road": sum(1 for r in merged_list if r.get("road_type") in ("trunk", "primary", "secondary", "motorway")),
        "on_side_street": sum(1 for r in merged_list if r.get("road_type") in ("residential", "service", "tertiary")),
        "by_sub_type": {},
        "business_type": business_type,
        "google_only_added": google_only,
        "google_enriched": enriched,
    }
    for r in merged_list:
        sub = r.get("sub_type") or "other"
        summary["by_sub_type"][sub] = summary["by_sub_type"].get(sub, 0) + 1

    geojson = {
        "type": "FeatureCollection",
        "features": [{
            "type": "Feature",
            "geometry": {"type": "Point", "coordinates": [r["lng"], r["lat"]]},
            "properties": {
                "osm_id": r.get("osm_id"),
                "google_id": r.get("google_id"),
                "name": r["name"],
                "sub_type": r.get("sub_type"),
                "distance_m": r["distance_m"],
                "road_type": r.get("road_type"),
                "road_label": r.get("road_label"),
                "has_barrier": r.get("has_barrier") or False,
                "rating": r.get("rating"),
                "review_count": r.get("review_count"),
                "open_now": r.get("open_now"),
                "price_level": r.get("price_level"),
                "source": r["source"],
            },
        } for r in merged_list],
    }

    return {"summary": summary, "geojson": geojson, "list": merged_list}


_SOURCE_ICONS = {
    "hospital": "🏥", "bus_station": "🚌", "cinema": "🎬", "college": "🎓",
    "school": "🏫", "railway_station": "🚂", "worship": "🛕", "govt_office": "🏛️",
    "market": "🛒", "stadium": "🏟️",
}


def opportunity_gaps(params):
    lng, lat, radius = params["lng"], params["lat"], params["radius"]
    business_type = params.get("business_type", "restaurant")
    effective_radius = min(radius, 3000)

    sql = f"""
    WITH site AS (
      SELECT ST_SetSRID(ST_MakePoint(%(lng)s, %(lat)s), 4326)::geography AS geog
    ),
    footfall_sources AS (
      SELECT
        p.osm_id, p.name, p.amenity, p.railway, p.office,
        ST_X(ST_Transform(p.way, 4326)) AS lng,
        ST_Y(ST_Transform(p.way, 4326)) AS lat,
        p.way,
        ST_Distance(p.way::geography, s.geog) AS distance_from_site_m,
        CASE
          WHEN p.amenity = 'hospital' THEN 'hospital'
          WHEN p.amenity = 'bus_station' THEN 'bus_station'
          WHEN p.amenity = 'cinema' THEN 'cinema'
          WHEN p.amenity IN ('college','university') THEN 'college'
          WHEN p.amenity = 'school' THEN 'school'
          WHEN p.railway = 'station' THEN 'railway_station'
          WHEN p.amenity = 'place_of_worship' THEN 'worship'
          WHEN p.office = 'government' OR p.amenity = 'townhall' THEN 'govt_office'
          WHEN p.amenity = 'marketplace' THEN 'market'
          WHEN p.amenity = 'stadium' THEN 'stadium'
        END AS source_type
      FROM planet_osm_point p, site s
      WHERE (
        p.amenity IN ('hospital','bus_station','cinema','college','university',
                       'school','place_of_worship','townhall','marketplace','stadium')
        OR p.office = 'government'
        OR p.railway = 'station'
      )
        AND ST_DWithin(p.way::geography, s.geog, %(eff_radius)s)
        AND p.name IS NOT NULL
    )
    SELECT
      fs.*,
      (
        SELECT COUNT(*)
        FROM planet_osm_point bp
        WHERE ({business_type_sql("%(business_type)s", "bp")})
          AND ST_DWithin(bp.way::geography, fs.way::geography, 300)
      )::int AS nearby_same_type_count
    FROM footfall_sources fs
    ORDER BY nearby_same_type_count ASC, distance_from_site_m ASC
    LIMIT 30;
    """
    qp = {"lng": lng, "lat": lat, "eff_radius": effective_radius, "business_type": business_type}

    rows, google_places = gather(
        lambda: db.query(sql, qp),
        lambda: fetch_google_places(lat, lng, effective_radius, business_type),
    )

    def haversine_m(lat1, lng1, lat2, lng2):
        R, rad = 6371000, math.pi / 180
        d_lat, d_lng = (lat2 - lat1) * rad, (lng2 - lng1) * rad
        a = (math.sin(d_lat / 2) ** 2
             + math.cos(lat1 * rad) * math.cos(lat2 * rad) * math.sin(d_lng / 2) ** 2)
        return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))

    google_norm = [
        {"lat": (g.get("location") or {}).get("latitude"),
         "lng": (g.get("location") or {}).get("longitude")}
        for g in google_places
    ]
    google_norm = [g for g in google_norm if g["lat"] and g["lng"]]

    enriched_rows = []
    for r in rows:
        fs_lat, fs_lng = db.num(r["lat"]), db.num(r["lng"])
        google_nearby = sum(1 for g in google_norm if haversine_m(fs_lat, fs_lng, g["lat"], g["lng"]) <= 300)
        enriched_rows.append({
            **dict(r),
            "nearby_same_type_count": db.to_int(r["nearby_same_type_count"]) + google_nearby,
            "google_nearby_count": google_nearby,
        })

    def shape(r):
        return {
            "osm_id": r["osm_id"],
            "name": r["name"],
            "source_type": r["source_type"],
            "source_icon": _SOURCE_ICONS.get(r["source_type"], "📍"),
            "distance_from_site_m": round(db.num(r["distance_from_site_m"])),
            "nearby_same_type_count": r["nearby_same_type_count"],
            "lng": db.num(r["lng"]),
            "lat": db.num(r["lat"]),
        }

    gaps = [shape(r) for r in enriched_rows if r["nearby_same_type_count"] == 0]
    underserved = [shape(r) for r in enriched_rows if r["nearby_same_type_count"] == 1]

    geojson = {
        "type": "FeatureCollection",
        "features": [{
            "type": "Feature",
            "geometry": {"type": "Point", "coordinates": [g["lng"], g["lat"]]},
            "properties": {**g, "is_gap": True},
        } for g in gaps],
    }

    return {
        "gaps_count": len(gaps),
        "underserved_count": len(underserved),
        "gaps": gaps,
        "underserved": underserved,
        "geojson": geojson,
    }


def competitor_context(comp_lng, comp_lat, site_lng, site_lat):
    context_sql = """
    WITH loc AS (
      SELECT ST_SetSRID(ST_MakePoint(%(lng)s, %(lat)s), 4326)::geography AS geog
    )
    (
      SELECT 'footfall' AS context_type, p.name, p.amenity AS sub_type,
        ST_Distance(p.way::geography, l.geog) AS distance_m
      FROM planet_osm_point p, loc l
      WHERE (
        p.amenity IN ('hospital','bus_station','cinema','college','university',
                       'school','place_of_worship','townhall','marketplace')
        OR p.office = 'government' OR p.railway = 'station'
      )
        AND ST_DWithin(p.way::geography, l.geog, 600)
        AND p.name IS NOT NULL
      ORDER BY distance_m
      LIMIT 5
    )
    UNION ALL
    (
      SELECT 'road' AS context_type, l.name, l.highway AS sub_type,
        ST_Distance(l.way::geography, loc.geog) AS distance_m
      FROM planet_osm_line l, loc
      WHERE l.highway IS NOT NULL
        AND ST_DWithin(l.way::geography, loc.geog, 80)
      ORDER BY distance_m
      LIMIT 1
    )
    UNION ALL
    (
      SELECT 'barrier' AS context_type,
        COALESCE(l.name, l.waterway, l.railway) AS name,
        COALESCE(l.railway, l.waterway, l.highway) AS sub_type,
        ST_Distance(l.way::geography, loc.geog) AS distance_m
      FROM planet_osm_line l, loc
      WHERE (
        l.railway IN ('rail','narrow_gauge','subway')
        OR l.waterway IN ('river','canal')
        OR l.highway IN ('motorway','trunk')
      )
        AND ST_DWithin(l.way::geography, loc.geog, 500)
      ORDER BY distance_m
      LIMIT 3
    )
    ORDER BY context_type, distance_m;
    """
    comp_ctx_rows, site_ctx_rows = [], []
    try:
        comp_ctx_rows, site_ctx_rows = gather(
            lambda: db.query(context_sql, {"lng": comp_lng, "lat": comp_lat}),
            lambda: db.query(context_sql, {"lng": site_lng, "lat": site_lat}),
        )
    except Exception as e:  # PostGIS offline — return empty context rather than crash
        print(f"[competitor_context] PostGIS unavailable, returning empty context: {e}")

    return {
        "competitor": {"lng": comp_lng, "lat": comp_lat, "context": db.jsonify([dict(r) for r in comp_ctx_rows])},
        "your_site": {"lng": site_lng, "lat": site_lat, "context": db.jsonify([dict(r) for r in site_ctx_rows])},
    }
