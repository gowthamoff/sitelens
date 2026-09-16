"""Port of server/services/footfallService.js — commercial footfall density model."""
from .. import db
from ..util import gather_map

FOOTFALL_CATEGORIES = [
    {"key": "transit", "label": "Transit Stops", "icon": "bus", "maxPoints": 15,
     "idealDistance": 200, "maxDistance": 1000,
     "why": "Bus/rail stops = guaranteed daily passing traffic",
     "sql": "(highway = 'bus_stop' OR amenity IN ('bus_station') OR railway IN ('station','halt','tram_stop'))",
     "table": "planet_osm_point"},
    {"key": "education", "label": "Education", "icon": "graduation-cap", "maxPoints": 15,
     "idealDistance": 500, "maxDistance": 2000,
     "why": "Students and parents generate daily foot traffic",
     "sql": "amenity IN ('school','college','university','kindergarten','library')",
     "table": "planet_osm_point"},
    {"key": "shopping", "label": "Retail Cluster", "icon": "shopping-bag", "maxPoints": 15,
     "idealDistance": 300, "maxDistance": 1500,
     "why": "Retail clusters attract more retail — proven demand zone",
     "sql": "shop IN ('supermarket','convenience','mall','department_store','clothes','general','grocery') OR amenity IN ('marketplace')",
     "table": "planet_osm_point"},
    {"key": "worship", "label": "Places of Worship", "icon": "landmark", "maxPoints": 10,
     "idealDistance": 300, "maxDistance": 1500,
     "why": "Temples/mosques/churches drive weekly crowds in India",
     "sql": "amenity = 'place_of_worship'", "table": "planet_osm_point"},
    {"key": "healthcare", "label": "Healthcare", "icon": "stethoscope", "maxPoints": 10,
     "idealDistance": 500, "maxDistance": 2000,
     "why": "Daily patient and visitor footfall",
     "sql": "amenity IN ('hospital','clinic','doctors','pharmacy','dentist')",
     "table": "planet_osm_point"},
    {"key": "banking", "label": "Banking & ATMs", "icon": "landmark", "maxPoints": 10,
     "idealDistance": 300, "maxDistance": 1000,
     "why": "Banks indicate commercial activity; ATMs = guaranteed foot traffic",
     "sql": "amenity IN ('bank','atm')", "table": "planet_osm_point"},
    {"key": "government", "label": "Government Offices", "icon": "building", "maxPoints": 10,
     "idealDistance": 500, "maxDistance": 2000,
     "why": "Government offices generate high daily visitor traffic",
     "sql": "amenity IN ('townhall','post_office','police') OR office = 'government'",
     "table": "planet_osm_point"},
    {"key": "food_drink", "label": "Food & Drink", "icon": "utensils", "maxPoints": 10,
     "idealDistance": 200, "maxDistance": 1000,
     "why": "Restaurant/café clusters signal a destination area",
     "sql": "amenity IN ('restaurant','cafe','fast_food','food_court','bar','pub')",
     "table": "planet_osm_point"},
    {"key": "recreation", "label": "Recreation & Entertainment", "icon": "trees", "maxPoints": 5,
     "idealDistance": 500, "maxDistance": 2000,
     "why": "Parks and entertainment venues attract families and weekend crowds",
     "sql": "leisure IN ('park','playground','sports_centre','fitness_centre') OR amenity IN ('cinema','theatre')",
     "table": "planet_osm_point"},
]

MAX_DIMINISH = 1 + 0.5 + 0.25 + 0.125 + 0.0625  # 1.9375


def proximity_decay(distance_m, ideal_distance, max_distance):
    if distance_m <= ideal_distance:
        return 1.0
    if distance_m >= max_distance:
        return 0.0
    normalized = (distance_m - ideal_distance) / (max_distance - ideal_distance)
    return 1.0 - normalized * normalized


def score_category(distances, config):
    if not distances:
        return 0
    total = 0.0
    for i, d in enumerate(distances[:5]):
        diminishing = 1.0 / (2 ** i)
        decay = proximity_decay(d, config["idealDistance"], config["maxDistance"])
        total += diminishing * decay
    return round((total / MAX_DIMINISH) * config["maxPoints"] * 10) / 10


def get_patience_status(nearest_m, ideal_distance, max_distance):
    if nearest_m is None:
        return {"label": "None Found", "color": "#ff7b72", "tier": "none"}
    if nearest_m <= ideal_distance:
        return {"label": "Peak Zone", "color": "#7ee787", "tier": "peak"}
    if nearest_m <= (ideal_distance + max_distance) / 2:
        return {"label": "Accessible", "color": "#a8e6a3", "tier": "good"}
    if nearest_m <= max_distance:
        return {"label": "Reachable", "color": "#ffa657", "tier": "moderate"}
    return {"label": "Too Far", "color": "#ff7b72", "tier": "far"}


def get_grade(score):
    if score >= 85:
        return {"letter": "A+", "label": "Exceptional Footfall", "color": "#7ee787"}
    if score >= 75:
        return {"letter": "A", "label": "Excellent Footfall", "color": "#7ee787"}
    if score >= 65:
        return {"letter": "B+", "label": "Very Good Footfall", "color": "#a8e6a3"}
    if score >= 55:
        return {"letter": "B", "label": "Good Footfall", "color": "#ffa657"}
    if score >= 40:
        return {"letter": "C", "label": "Moderate Footfall", "color": "#ffa657"}
    if score >= 25:
        return {"letter": "D", "label": "Low Footfall", "color": "#ff9966"}
    return {"letter": "F", "label": "Poor Footfall", "color": "#ff7b72"}


def footfall_analysis(params):
    lng, lat, radius = params["lng"], params["lat"], params["radius"]

    def run(cat):
        effective_radius = min(radius, cat["maxDistance"])
        sql = f"""
        SELECT
          ST_Distance(
            way::geography,
            ST_SetSRID(ST_MakePoint(%(lng)s, %(lat)s), 4326)::geography
          ) AS distance_m,
          ST_X(ST_Transform(way, 4326)) AS lon,
          ST_Y(ST_Transform(way, 4326)) AS lat_coord,
          name
        FROM {cat["table"]}
        WHERE ({cat["sql"]})
          AND ST_DWithin(
            way::geography,
            ST_SetSRID(ST_MakePoint(%(lng)s, %(lat)s), 4326)::geography,
            %(radius)s
          )
        ORDER BY distance_m ASC
        LIMIT 20;
        """
        rows = db.query(sql, {"lng": lng, "lat": lat, "radius": effective_radius})
        distances = [db.num(r["distance_m"]) for r in rows]
        score = score_category(distances, cat)
        nearest_m = round(distances[0]) if distances else None

        heatmap_points = [
            {
                "lng": db.num(r["lon"]),
                "lat": db.num(r["lat_coord"]),
                "weight": min(1, (cat["maxPoints"] / 15) * proximity_decay(
                    db.num(r["distance_m"]), cat["idealDistance"], cat["maxDistance"])),
                "category": cat["key"],
            }
            for r in rows[:10]
        ]

        top_pois = [
            {
                "name": (r["name"].strip() if r.get("name") and r["name"].strip() else "Unnamed"),
                "distance_m": round(db.num(r["distance_m"])),
                "lng": db.num(r["lon"]),
                "lat": db.num(r["lat_coord"]),
            }
            for r in rows[:5]
        ]

        return {
            "key": cat["key"],
            "label": cat["label"],
            "icon": cat["icon"],
            "score": score,
            "maxPoints": cat["maxPoints"],
            "count": len(rows),
            "nearest_m": nearest_m,
            "idealDistance": cat["idealDistance"],
            "maxDistance": cat["maxDistance"],
            "why": cat["why"],
            "topPois": top_pois,
            "heatmapPoints": heatmap_points,
            "patienceStatus": get_patience_status(nearest_m, cat["idealDistance"], cat["maxDistance"]),
        }

    category_results = gather_map(run, FOOTFALL_CATEGORIES)

    total_score = round(sum(c["score"] for c in category_results))
    heatmap_points = [pt for c in category_results for pt in c["heatmapPoints"]]
    grade = get_grade(total_score)

    top_drivers = [
        {"key": c["key"], "label": c["label"], "score": c["score"], "maxPoints": c["maxPoints"]}
        for c in sorted(category_results, key=lambda c: c["score"], reverse=True)[:3]
    ]

    return {
        "total_score": total_score,
        "max_score": 100,
        "grade": grade["letter"],
        "grade_label": grade["label"],
        "grade_color": grade["color"],
        "breakdown": category_results,
        "top_drivers": top_drivers,
        "heatmap_points": heatmap_points,
    }
