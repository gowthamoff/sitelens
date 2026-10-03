"""
Query schemas for the site-scoped endpoints (/api/competitors, /api/demand-mix).

Raw query values arrive as strings; the before-validators parse them with plain
float()/int() so edge cases ("", " 12 ", "1e2", "nan", "inf") behave exactly like
the hand-written validation they replace (common.validate_site_params and the old
demand-mix route). Routes map ValidationError → their legacy 400 bodies via the
*_error_message helpers, so the React client sees no change.
"""
import math

from pydantic import BaseModel, Field, ValidationError, field_validator

from ..services.competitor import VALID_TYPES

_BOUND_ERRORS = {"greater_than_equal", "less_than_equal"}


def _parse_coord(v):
    try:
        f = float(v)
    except (TypeError, ValueError):
        raise ValueError("not a number")
    if math.isnan(f):
        raise ValueError("not a number")
    return f  # ±inf passes through and fails the range check, as before


class SiteParams(BaseModel):  # shared site input: a point + search radius
    lat: float = Field(ge=-90, le=90)  # required; out-of-range latitude fails validation
    lng: float = Field(ge=-180, le=180)  # required; out-of-range longitude fails validation
    radius: int = Field(1000, ge=100, le=10000)  # metres; default 1000, bounds 100 m–10 km

    @field_validator("lat", "lng", mode="before")  # runs on the RAW value, before float conversion
    @classmethod  # Pydantic validators are class methods
    def _parse_coords(cls, v):
        return _parse_coord(v)  # non-numeric or NaN → ValueError → 400; otherwise a float for the range check

    @field_validator("radius", mode="before")  # raw value, before int conversion and the bounds check
    @classmethod
    def _coerce_radius(cls, v):
        # Garbage → 1000, then clamp to 100 m–10 km (validate_site_params semantics).
        try:
            r = int(float(v))  # float first so "1500.7" works; int drops the decimals
        except (TypeError, ValueError, OverflowError):  # None, "junk", "inf" (int(inf) overflows)
            r = 1000  # radius is forgiving: bad input falls back to the default instead of erroring
        return min(max(r, 100), 10000)  # clamp, so the Field bounds above can never reject it


class CompetitorQuery(SiteParams):
    business_type: str = "restaurant"

    @field_validator("business_type", mode="before")
    @classmethod
    def _check_business_type(cls, v):
        bt = v or "restaurant"
        if bt not in VALID_TYPES:
            raise ValueError("invalid business_type")
        return bt


class DemandMixQuery(SiteParams):
    radius: int = Field(500, ge=100, le=5000)

    @field_validator("radius", mode="before")
    @classmethod
    def _coerce_radius(cls, v):
        # Garbage → 500; out-of-range is rejected (not clamped), unlike SiteParams.
        try:
            return int(float(v or "500"))
        except (TypeError, ValueError, OverflowError):
            return 500


def _errors_by_field(exc: ValidationError):
    out = {}
    for e in exc.errors():
        field = e["loc"][0] if e["loc"] else None
        out.setdefault(field, []).append(e["type"])
    return out


def _coord_error(errs):
    """'invalid' if any lat/lng failed to parse, 'bounds' if only range checks failed."""
    coord = errs.get("lat", []) + errs.get("lng", [])
    if not coord:
        return None
    return "bounds" if all(t in _BOUND_ERRORS for t in coord) else "invalid"


def competitor_error_message(exc: ValidationError) -> str:
    errs = _errors_by_field(exc)
    kind = _coord_error(errs)
    if kind == "invalid":
        return "Invalid geo-coordinates. Provide numeric lat and lng."
    if kind == "bounds":
        return "Coordinates out of terrestrial bounds."
    if "business_type" in errs:
        return f"Invalid business_type. Use one of: {', '.join(VALID_TYPES)}"
    return "Invalid request parameters."


def demand_mix_error_message(exc: ValidationError) -> str:
    errs = _errors_by_field(exc)
    kind = _coord_error(errs)
    if kind == "invalid":
        return "lat/lng required"
    if kind == "bounds":
        return "lat/lng out of range"
    if "radius" in errs:
        return "radius must be 100–5000 m"
    return "Invalid request parameters."
