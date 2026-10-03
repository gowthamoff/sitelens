from decimal import Decimal

import pytest

from app.services import demand_mix as svc


def _patch_row(monkeypatch, row):
    seen = {}

    def fake_query_one(sql, params=None):
        seen["params"] = params
        return row

    monkeypatch.setattr(svc.db, "query_one", fake_query_one)
    return seen


def test_demand_mix_percentages_profile_and_peaks(monkeypatch):
    seen = _patch_row(monkeypatch, {
        "office_m2": Decimal("6000"), "residential_m2": Decimal("3000"),
        "college_m2": Decimal("0"), "transit_m2": 1000,
    })
    out = svc.demand_mix(12.97, 77.59, 800)

    assert seen["params"] == {"lng": 77.59, "lat": 12.97, "radius": 800}
    assert out["site"] == {"lat": 12.97, "lng": 77.59, "radius_m": 800}
    assert out["raw_areas_m2"] == {
        "office_m2": 6000.0, "residential_m2": 3000.0, "college_m2": 0.0, "transit_m2": 1000.0,
    }
    assert out["mix_pct"] == {"office": 60, "residential": 30, "college": 0, "transit": 10}
    assert out["profile"] == "office_dominant"
    assert out["peak_pattern"] == [
        "10:30–11:30 AM (office break)", "4–5 PM (evening break)",
        "6–8 AM (breakfast chai)", "6–9 PM (evening social)",
    ]


def test_demand_mix_zero_total(monkeypatch):
    _patch_row(monkeypatch, {"office_m2": None, "residential_m2": 0, "college_m2": 0, "transit_m2": 0})
    out = svc.demand_mix(1.0, 2.0, 500)
    assert out["mix_pct"] == {"office": 0, "residential": 0, "college": 0, "transit": 0}
    assert out["profile"] == "mixed"
    assert out["peak_pattern"] == ["Insufficient demand drivers in walking radius"]


@pytest.mark.parametrize("mix,profile", [
    ({"office": 25, "residential": 25, "college": 25, "transit": 25}, "mixed"),
    ({"office": 10, "residential": 20, "college": 40, "transit": 30}, "college_dominant"),
])
def test_classify_profile(mix, profile):
    assert svc._classify_profile(mix) == profile


def test_predict_peaks_transit_threshold_and_all_drivers():
    peaks = svc._predict_peaks({"office": 0, "residential": 0, "college": 0, "transit": 20})
    assert peaks == ["7–10 AM (morning commute)", "5–8 PM (return commute)"]
    all_peaks = svc._predict_peaks({"office": 25, "residential": 25, "college": 25, "transit": 25})
    assert len(all_peaks) == len(set(all_peaks)) == 8


def test_demand_mix_propagates_db_errors(monkeypatch):
    def boom(sql, params=None):
        raise RuntimeError("db down")

    monkeypatch.setattr(svc.db, "query_one", boom)
    with pytest.raises(RuntimeError):
        svc.demand_mix(1.0, 2.0, 500)
