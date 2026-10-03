import pytest

from app.routes import demand_mix as route

URL = "/api/demand-mix"
CANNED = {
    "site": {"lat": 12.97, "lng": 77.59, "radius_m": 500},
    "raw_areas_m2": {"office_m2": 1.0, "residential_m2": 0.0, "college_m2": 0.0, "transit_m2": 0.0},
    "mix_pct": {"office": 100, "residential": 0, "college": 0, "transit": 0},
    "profile": "office_dominant",
    "peak_pattern": ["10:30–11:30 AM (office break)", "4–5 PM (evening break)"],
}


@pytest.fixture
def service(monkeypatch):
    calls = []

    def fake(lat, lng, radius):
        calls.append((lat, lng, radius))
        return CANNED

    monkeypatch.setattr(route, "demand_mix_service", fake)
    return calls


@pytest.mark.parametrize("radius,expected", [(None, 500), ("", 500), ("junk", 500), ("1200", 1200)])
def test_valid_request_returns_bare_body(client, service, radius, expected):
    params = {"lat": "12.97", "lng": "77.59"}
    if radius is not None:
        params["radius"] = radius
    res = client.get(URL, params=params)
    assert res.status_code == 200
    assert res.json() == CANNED  # this route has no ok/data envelope
    assert service[-1] == (12.97, 77.59, expected)


@pytest.mark.parametrize("params,message", [
    ({"lng": "77"}, "lat/lng required"),
    ({"lat": "x", "lng": "77"}, "lat/lng required"),
    ({"lat": "91", "lng": "77"}, "lat/lng out of range"),
    ({"lat": "12", "lng": "77", "radius": "99"}, "radius must be 100–5000 m"),
    ({"lat": "12", "lng": "77", "radius": "5001"}, "radius must be 100–5000 m"),
])
def test_invalid_params_return_400_error_body(client, service, params, message):
    res = client.get(URL, params=params)
    assert res.status_code == 400
    assert res.json() == {"error": message}
    assert service == []


def test_service_failure_returns_500_body(client, monkeypatch):
    def boom(lat, lng, radius):
        raise RuntimeError("db down")

    monkeypatch.setattr(route, "demand_mix_service", boom)
    res = client.get(URL, params={"lat": "12", "lng": "77"})
    assert res.status_code == 500
    assert res.json() == {"error": "demand-mix query failed"}


def test_requires_auth(anon_client, service):
    res = anon_client.get(URL, params={"lat": "12", "lng": "77"})
    assert res.status_code == 401
    assert res.json() == {"success": False, "error": "Authentication required"}
    assert service == []
