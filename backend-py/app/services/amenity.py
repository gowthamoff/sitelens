"""Port of server/services/amenityService.js."""
from .. import db
from ..util import gather_map

_CATEGORIES = [
    {"key": "health", "weight": 20, "maxScore": 5,
     "sql": "amenity IN ('hospital', 'clinic', 'doctors', 'dentist', 'pharmacy')"},
    {"key": "education", "weight": 20, "maxScore": 5,
     "sql": "amenity IN ('school', 'university', 'college', 'kindergarten', 'library')"},
    {"key": "retail", "weight": 15, "maxScore": 5,
     "sql": "amenity IN ('marketplace', 'mall') OR shop IN ('supermarket', 'convenience', 'bakery', 'butcher')"},
    {"key": "food", "weight": 10, "maxScore": 8,
     "sql": "amenity IN ('restaurant', 'cafe', 'fast_food', 'food_court', 'pub')"},
    {"key": "finance", "weight": 10, "maxScore": 3,
     "sql": "amenity IN ('bank', 'atm')"},
    {"key": "leisure", "weight": 15, "maxScore": 5,
     "sql": "leisure IN ('park', 'playground', 'sports_centre', 'swimming_pool', 'fitness_centre')"},
    {"key": "safety", "weight": 10, "maxScore": 3,
     "sql": "amenity IN ('police', 'fire_station', 'hospital')"},
]


def amenity_score(params):
    lng, lat, radius = params["lng"], params["lat"], params["radius"]

    def run(cat):
        sql = f"""
        SELECT COUNT(*) AS cnt
        FROM planet_osm_point
        WHERE ({cat["sql"]})
          AND ST_DWithin(
            way::geography,
            ST_SetSRID(ST_MakePoint(%(lng)s, %(lat)s), 4326)::geography,
            %(radius)s
          );
        """
        row = db.query_one(sql, {"lng": lng, "lat": lat, "radius": radius})
        count = db.to_int(row["cnt"])
        raw = min(count, cat["maxScore"]) / cat["maxScore"]
        weighted = raw * cat["weight"]
        return {"key": cat["key"], "count": count, "score": round(weighted * 10) / 10}

    scores = gather_map(run, _CATEGORIES)
    total = round(sum(c["score"] for c in scores))
    grade = "A" if total >= 80 else "B" if total >= 60 else "C" if total >= 40 else "D"
    return {"total_score": total, "max_score": 100, "grade": grade, "breakdown": scores}
