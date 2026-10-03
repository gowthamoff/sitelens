import pytest

from app.routes import competitors as route

URL = "/api/competitors"
CANNED = {"summary": {"total_count": 0}, "geojson": {"type": "FeatureCollection", "features": []}, "list": []}


@pytest.fixture
def service(monkeypatch):
    calls = []

    def fake(params):
        calls.append(params)
        return CANNED

    monkeypatch.setattr(route, "competitor_analysis", fake)
    return calls


def test_valid_request_returns_envelope(client, service):
    res = client.get(URL, params={"lat": "12.97", "lng": "77.59", "radius": "1500", "business_type": "tea"})
    assert res.status_code == 200
    body = res.json()
    assert body["ok"] is True and body["data"] == CANNED and body["timestamp"].endswith("Z")
    assert service == [{"lat": 12.97, "lng": 77.59, "radius": 1500, "business_type": "tea"}]


@pytest.mark.parametrize("radius,expected", [(None, 1000), ("junk", 1000), ("5", 100), ("50000", 10000)])
def test_radius_is_clamped_not_rejected(client, service, radius, expected):
    params = {"lat": "12.97", "lng": "77.59"}
    if radius is not None:
        params["radius"] = radius
    assert client.get(URL, params=params).status_code == 200
    assert service[-1]["radius"] == expected
    assert service[-1]["business_type"] == "restaurant"


@pytest.mark.parametrize("params,message", [
    ({"lng": "77"}, "Invalid geo-coordinates. Provide numeric lat and lng."),
    ({"lat": "abc", "lng": "77"}, "Invalid geo-coordinates. Provide numeric lat and lng."),
    ({"lat": "95", "lng": "77"}, "Coordinates out of terrestrial bounds."),
    ({"lat": "12", "lng": "-181"}, "Coordinates out of terrestrial bounds."),
    ({"lat": "12", "lng": "77", "business_type": "casino"},
     "Invalid business_type. Use one of: restaurant, pharmacy, grocery, clinic, hospital, "
     "education, fitness, bank, hotel, tea"),
])
def test_invalid_params_return_400_error_envelope(client, service, params, message):
    res = client.get(URL, params=params)
    assert res.status_code == 400
    body = res.json()
    assert body["ok"] is False and body["error"] == message
    assert body["code"] == 400 and body["hint"] is None
    assert service == []


def test_requires_auth(anon_client, service):
    res = anon_client.get(URL, params={"lat": "12", "lng": "77"})
    assert res.status_code == 401
    assert res.json() == {"success": False, "error": "Authentication required"}
    assert service == []
