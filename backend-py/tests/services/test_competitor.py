import pytest

from app.services import competitor

SITE = {"lat": 12.9716, "lng": 77.5946}


def _row(osm_id, name, distance, road, barrier, lat, lng, **tags):
    base = {"amenity": None, "shop": None, "tourism": None, "leisure": None, "office": None}
    base.update(tags)
    return {"osm_id": osm_id, "name": name, "distance_m": distance, "road_type": road,
            "has_barrier": barrier, "lat": lat, "lng": lng, **base}


ROWS = [
    _row(1, "Cafe A", 120.4, "primary", False, 12.9726, 77.5946, amenity="cafe"),
    _row(2, "Diner B", 480.6, "residential", True, 12.9759, 77.5946, amenity="restaurant"),
    _row(3, "Kiosk C", 900.0, None, None, 12.9797, 77.5946, shop="kiosk"),
]

GOOGLE = [
    # ~1 m from Cafe A -> enriches it (osm+google)
    {"id": "g1", "displayName": {"text": "Cafe A"}, "location": {"latitude": 12.97261, "longitude": 77.5946},
     "primaryType": "cafe", "rating": 4.4, "userRatingCount": 210,
     "currentOpeningHours": {"openNow": True, "weekdayDescriptions": ["Mon: 9-5"]},
     "priceLevel": "PRICE_LEVEL_MODERATE", "formattedAddress": "MG Road"},
    # no OSM venue within 30 m -> appended as google-only
    {"id": "g2", "displayName": {"text": "New Bistro"}, "location": {"latitude": 12.9736, "longitude": 77.5946},
     "primaryType": "restaurant", "rating": 4.0, "userRatingCount": 12},
    # no location -> dropped
    {"id": "g3", "displayName": {"text": "Ghost"}},
]


@pytest.fixture
def fake_backends(monkeypatch):
    calls = {}

    def fake_query(sql, params=None):
        calls["sql_params"] = params
        return [dict(r) for r in ROWS]

    def fake_google(lat, lng, radius, business_type="restaurant"):
        calls["google"] = (lat, lng, radius, business_type)
        return GOOGLE

    monkeypatch.setattr(competitor.db, "query", fake_query)
    monkeypatch.setattr(competitor, "fetch_google_places", fake_google)
    monkeypatch.setattr(competitor, "gather", lambda *fns: [f() for f in fns])
    return calls


def test_competitor_analysis_summary_and_merge(fake_backends):
    out = competitor.competitor_analysis({**SITE, "radius": 1000, "business_type": "restaurant"})

    lst = out["list"]
    assert [r["name"] for r in lst] == ["Cafe A", "New Bistro", "Diner B", "Kiosk C"]
    assert [r["source"] for r in lst] == ["osm+google", "google", "osm", "osm"]
    assert lst[0]["rating"] == 4.4 and lst[0]["google_id"] == "g1" and lst[0]["open_now"] is True
    assert lst[0]["distance_m"] == 120  # OSM distance kept on enrich
    assert lst[0]["road_label"] == "State Highway"

    s = out["summary"]
    assert s["total_count"] == 4
    assert s["nearest_m"] == 120 and s["farthest_m"] == 900
    assert s["with_barrier"] == 1
    assert s["on_main_road"] == 1 and s["on_side_street"] == 1
    assert s["by_sub_type"] == {"cafe": 1, "restaurant": 2, "kiosk": 1}
    assert s["google_only_added"] == 1 and s["google_enriched"] == 1
    assert s["business_type"] == "restaurant"

    feats = out["geojson"]["features"]
    assert len(feats) == 4
    assert feats[0]["geometry"] == {"type": "Point", "coordinates": [77.5946, 12.9726]}
    assert feats[3]["properties"]["has_barrier"] is False  # None -> False


def test_competitor_analysis_caps_radius_at_3km(fake_backends):
    competitor.competitor_analysis({**SITE, "radius": 10000, "business_type": "pharmacy"})
    assert fake_backends["sql_params"]["eff_radius"] == 3000
    assert fake_backends["sql_params"]["business_type"] == "pharmacy"
    assert fake_backends["google"] == (SITE["lat"], SITE["lng"], 3000, "pharmacy")


def test_competitor_analysis_empty(monkeypatch):
    monkeypatch.setattr(competitor.db, "query", lambda sql, params=None: [])
    monkeypatch.setattr(competitor, "fetch_google_places", lambda *a, **k: [])
    monkeypatch.setattr(competitor, "gather", lambda *fns: [f() for f in fns])
    out = competitor.competitor_analysis({**SITE, "radius": 500})
    assert out["list"] == [] and out["geojson"]["features"] == []
    assert out["summary"]["total_count"] == 0
    assert out["summary"]["nearest_m"] is None and out["summary"]["farthest_m"] is None
    assert out["summary"]["business_type"] == "restaurant"
