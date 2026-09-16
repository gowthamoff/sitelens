"""Port of server/services/proximityService.js."""
from .. import db
from ..util import gather_map

_CATEGORIES = [
    {"label": "Hospital / Clinic", "col": "amenity", "values": ["hospital", "clinic", "doctors"]},
    {"label": "School / Education", "col": "amenity", "values": ["school", "university", "college", "kindergarten"]},
    {"label": "Supermarket / Shop", "col": "shop", "values": ["supermarket", "mall", "convenience"]},
    {"label": "Restaurant / Café", "col": "amenity", "values": ["restaurant", "cafe", "fast_food", "food_court"]},
    {"label": "Bank / ATM", "col": "amenity", "values": ["bank", "atm"]},
    {"label": "Park / Recreation", "col": "leisure", "values": ["park", "playground", "garden"]},
    {"label": "Pharmacy", "col": "amenity", "values": ["pharmacy"]},
    {"label": "Police / Fire", "col": "amenity", "values": ["police", "fire_station"]},
]


def proximity_summary(params):
    lng, lat, radius = params["lng"], params["lat"], params["radius"]

    def run(cat):
        vals = ", ".join(f"'{v}'" for v in cat["values"])
        sql = f"""
        SELECT
          COUNT(*) AS count,
          MIN(ST_Distance(
            way::geography,
            ST_SetSRID(ST_MakePoint(%(lng)s, %(lat)s), 4326)::geography
          )) AS nearest_m
        FROM planet_osm_point
        WHERE {cat["col"]} IN ({vals})
          AND ST_DWithin(
            way::geography,
            ST_SetSRID(ST_MakePoint(%(lng)s, %(lat)s), 4326)::geography,
            %(radius)s
          );
        """
        row = db.query_one(sql, {"lng": lng, "lat": lat, "radius": radius})
        nearest = row["nearest_m"]
        return {
            "category": cat["label"],
            "count": db.to_int(row["count"]),
            "nearest_m": round(db.num(nearest)) if nearest is not None else None,
        }

    return gather_map(run, _CATEGORIES)


def nearest_neighbours(params):
    lng, lat, radius = params["lng"], params["lat"], params["radius"]
    sql = """
    SELECT
      osm_id, name, amenity, shop, leisure, tourism,
      ST_Distance(
        way::geography,
        ST_SetSRID(ST_MakePoint(%(lng)s, %(lat)s), 4326)::geography
      ) AS distance_m,
      ST_AsGeoJSON(way) AS geojson
    FROM planet_osm_point
    WHERE (
      amenity IS NOT NULL OR shop IS NOT NULL OR
      leisure IS NOT NULL OR tourism IS NOT NULL
    )
      AND ST_DWithin(
        way::geography,
        ST_SetSRID(ST_MakePoint(%(lng)s, %(lat)s), 4326)::geography,
        %(radius)s
      )
    ORDER BY distance_m ASC
    LIMIT 100;
    """
    rows = db.query(sql, {"lng": lng, "lat": lat, "radius": radius})
    out = []
    for r in rows:
        r = dict(r)
        r["distance_m"] = round(db.num(r["distance_m"]))
        r["geojson"] = db.parse_geojson(r["geojson"])
        out.append(r)
    return out
