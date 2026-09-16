"""
Port of server/services/googlePlacesService.js.

Fetches rating-enriched POIs from Google Places (New) Nearby Search and merges
them with OSM results. If GOOGLE_PLACES_KEY is unset, fetch returns [] so the
rest of the competitor pipeline keeps working (OSM-only mode) — same graceful
degradation as the Node version.
"""
import math

import httpx

from .. import config

GOOGLE_TYPES_MAP = {
    "restaurant": ["restaurant", "fast_food_restaurant", "cafe", "food_court", "ice_cream_shop"],
    "pharmacy": ["pharmacy", "drugstore"],
    "grocery": ["supermarket", "grocery_store", "convenience_store", "wholesale_store"],
    "clinic": ["doctor", "dentist", "medical_clinic", "veterinary_care"],
    "hospital": ["hospital"],
    "education": ["school", "university", "primary_school", "secondary_school"],
    "fitness": ["gym", "sports_club", "fitness_center"],
    "bank": ["bank", "atm"],
    "hotel": ["hotel", "motel", "hostel", "lodging"],
    "tea": ["cafe", "coffee_shop", "tea_house"],
}

_FIELD_MASK = ",".join([
    "places.id", "places.displayName", "places.location", "places.types",
    "places.primaryType", "places.rating", "places.userRatingCount",
    "places.currentOpeningHours", "places.formattedAddress", "places.priceLevel",
])


def haversine_metres(lat1, lng1, lat2, lng2):
    R = 6371000
    rad = math.pi / 180
    d_lat = (lat2 - lat1) * rad
    d_lng = (lng2 - lng1) * rad
    a = (math.sin(d_lat / 2) ** 2
         + math.cos(lat1 * rad) * math.cos(lat2 * rad) * math.sin(d_lng / 2) ** 2)
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def fetch_google_places(lat, lng, radius, business_type="restaurant"):
    api_key = config.GOOGLE_PLACES_KEY
    if not api_key or api_key.strip() == "":
        print("[GooglePlaces] GOOGLE_PLACES_KEY missing/empty — OSM-only mode (no ratings/hours).")
        return []

    included_types = GOOGLE_TYPES_MAP.get(business_type, ["establishment"])
    body = {
        "includedTypes": included_types,
        "maxResultCount": 20,
        "locationRestriction": {
            "circle": {
                "center": {"latitude": lat, "longitude": lng},
                "radius": min(radius, 50000),  # Google's Nearby Search max
            }
        },
    }
    headers = {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": api_key,
        "X-Goog-FieldMask": _FIELD_MASK,
    }
    try:
        with httpx.Client(timeout=10.0) as client:
            res = client.post(
                "https://places.googleapis.com/v1/places:searchNearby",
                json=body, headers=headers,
            )
    except httpx.HTTPError as e:
        print(f"[GooglePlaces] Network error: {e}")
        return []

    if res.status_code != 200:
        print(f"[GooglePlaces] API error {res.status_code}: {res.text}")
        return []

    return res.json().get("places", []) or []


def normalise_google_place(g, site_lat, site_lng):
    loc = g.get("location") or {}
    lat = loc.get("latitude")
    lng = loc.get("longitude")
    if not lat or not lng:
        return None
    opening = g.get("currentOpeningHours") or {}
    return {
        "google_id": g.get("id"),
        "name": (g.get("displayName") or {}).get("text") or "Unnamed",
        "lat": lat,
        "lng": lng,
        "amenity": g.get("primaryType"),
        "sub_type": g.get("primaryType") or "place",
        "rating": g.get("rating"),
        "review_count": g.get("userRatingCount"),
        "open_now": opening.get("openNow"),
        "hours": opening.get("weekdayDescriptions") or [],
        "price_level": g.get("priceLevel"),
        "address": g.get("formattedAddress"),
        "distance_m": round(haversine_metres(site_lat, site_lng, lat, lng)),
        "source": "google",
    }


def merge_osm_with_google(osm_list, g_places, site_lat, site_lng):
    """For each Google place: enrich a matching OSM row within 30 m, else append it."""
    merged = [{**p, "source": "osm"} for p in osm_list]

    for g in g_places:
        norm = normalise_google_place(g, site_lat, site_lng)
        if not norm:
            continue
        duplicate = next(
            (osm for osm in merged
             if haversine_metres(osm["lat"], osm["lng"], norm["lat"], norm["lng"]) < 30),
            None,
        )
        if duplicate:
            duplicate["rating"] = norm["rating"]
            duplicate["review_count"] = norm["review_count"]
            duplicate["open_now"] = norm["open_now"]
            duplicate["hours"] = norm["hours"]
            duplicate["price_level"] = norm["price_level"]
            duplicate["address"] = norm["address"]
            duplicate["google_id"] = norm["google_id"]
            duplicate["source"] = "osm+google"
        else:
            merged.append(norm)

    merged.sort(key=lambda r: r["distance_m"])
    return merged
