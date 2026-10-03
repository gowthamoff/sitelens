import pytest
from pydantic import ValidationError

from app.schemas.site import (
    CompetitorQuery, DemandMixQuery, SiteParams,
    competitor_error_message, demand_mix_error_message,
)
from app.services.competitor import VALID_TYPES


def test_site_params_valid_strings_are_parsed():
    p = SiteParams(lat="12.97", lng="77.59", radius="750")
    assert (p.lat, p.lng, p.radius) == (12.97, 77.59, 750)


@pytest.mark.parametrize("lat,lng", [
    ("90", "180"), ("-90", "-180"), ("0", "0"), (" 12.5 ", "1e1"),
])
def test_site_params_coordinate_bounds_inclusive(lat, lng):
    p = SiteParams(lat=lat, lng=lng)
    assert p.lat == float(lat) and p.lng == float(lng)


@pytest.mark.parametrize("lat,lng", [
    ("90.0001", "0"), ("-91", "0"), ("0", "180.5"), ("0", "-181"), ("inf", "0"),
])
def test_site_params_out_of_bounds(lat, lng):
    with pytest.raises(ValidationError) as ei:
        CompetitorQuery(lat=lat, lng=lng)
    assert competitor_error_message(ei.value) == "Coordinates out of terrestrial bounds."


@pytest.mark.parametrize("lat,lng", [
    (None, "77"), ("12", None), ("", "77"), ("abc", "77"), ("nan", "77"),
    ("999", "abc"),  # unparseable wins over out-of-range, as in validate_site_params
])
def test_site_params_non_numeric(lat, lng):
    with pytest.raises(ValidationError) as ei:
        CompetitorQuery(lat=lat, lng=lng)
    assert competitor_error_message(ei.value) == "Invalid geo-coordinates. Provide numeric lat and lng."


@pytest.mark.parametrize("raw,expected", [
    (None, 1000), ("", 1000), ("garbage", 1000), ("inf", 1000),
    ("50", 100), ("100", 100), ("2500.9", 2500), ("10000", 10000), ("99999", 10000),
])
def test_site_params_radius_defaults_and_clamping(raw, expected):
    assert SiteParams(lat="1", lng="1", radius=raw).radius == expected


def test_site_params_radius_default_when_omitted():
    assert SiteParams(lat="1", lng="1").radius == 1000


@pytest.mark.parametrize("bt", VALID_TYPES)
def test_competitor_query_accepts_valid_types(bt):
    assert CompetitorQuery(lat="1", lng="1", business_type=bt).business_type == bt


@pytest.mark.parametrize("bt", [None, ""])
def test_competitor_query_business_type_defaults(bt):
    assert CompetitorQuery(lat="1", lng="1", business_type=bt).business_type == "restaurant"


@pytest.mark.parametrize("bt", ["casino", "Restaurant", "restaurant "])
def test_competitor_query_rejects_invalid_type(bt):
    with pytest.raises(ValidationError) as ei:
        CompetitorQuery(lat="1", lng="1", business_type=bt)
    assert competitor_error_message(ei.value).startswith("Invalid business_type. Use one of: restaurant")


def test_competitor_query_coords_reported_before_business_type():
    with pytest.raises(ValidationError) as ei:
        CompetitorQuery(lat="x", lng="1", business_type="casino")
    assert competitor_error_message(ei.value).startswith("Invalid geo-coordinates")


@pytest.mark.parametrize("raw,expected", [
    (None, 500), ("", 500), ("garbage", 500), ("100", 100), ("5000", 5000), ("250.7", 250),
])
def test_demand_mix_radius_valid(raw, expected):
    assert DemandMixQuery(lat="1", lng="1", radius=raw).radius == expected


def test_demand_mix_radius_default_when_omitted():
    assert DemandMixQuery(lat="1", lng="1").radius == 500


@pytest.mark.parametrize("raw", ["99", "5001", "0", "-500"])
def test_demand_mix_radius_out_of_range_is_rejected_not_clamped(raw):
    with pytest.raises(ValidationError) as ei:
        DemandMixQuery(lat="1", lng="1", radius=raw)
    assert demand_mix_error_message(ei.value) == "radius must be 100–5000 m"


@pytest.mark.parametrize("lat,lng,msg", [
    (None, "1", "lat/lng required"),
    ("abc", "1", "lat/lng required"),
    ("91", "1", "lat/lng out of range"),
    ("1", "-200", "lat/lng out of range"),
])
def test_demand_mix_coordinate_errors(lat, lng, msg):
    with pytest.raises(ValidationError) as ei:
        DemandMixQuery(lat=lat, lng=lng)
    assert demand_mix_error_message(ei.value) == msg
