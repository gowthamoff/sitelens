"""
Shared response envelopes, errors, and site-param validation.

Ports:
  - server/utils/response.js        → success() / error_body()
  - server/middleware/validate.js   → validate_site_params()
  - server/middleware/errorHandler  → ApiError (carries an HTTP status + hint)
  - server/middleware/auth.js        → AuthError (distinct {success:false} shape)
"""
from datetime import datetime, timezone


def _now_iso():
    # Matches JS new Date().toISOString() (UTC, millisecond precision, trailing Z).
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.") + \
        f"{datetime.now(timezone.utc).microsecond // 1000:03d}Z"


def success(data):
    return {"ok": True, "timestamp": _now_iso(), "data": data}


def error_body(message, code=500, hint=None):
    return {"ok": False, "timestamp": _now_iso(), "error": message, "code": code, "hint": hint}


class ApiError(Exception):
    """Raised by services/handlers; rendered via the error() envelope.

    Mirrors the Node pattern of throwing an Error with an attached .status/.hint
    that the global errorHandler honoured.
    """
    def __init__(self, message, status=500, hint=None):
        super().__init__(message)
        self.message = message
        self.status = status
        self.hint = hint


class AuthError(Exception):
    """Auth failures — rendered as {success:false, error} (not the ok-envelope),
    matching server/middleware/auth.js."""
    def __init__(self, message, status=401):
        super().__init__(message)
        self.message = message
        self.status = status


def validate_site_params(lat, lng, radius):
    """Port of validateSiteParams. Returns {lat,lng,radius} or raises ApiError(400)."""
    try:
        lat_num = float(lat)
        lng_num = float(lng)
    except (TypeError, ValueError):
        raise ApiError("Invalid geo-coordinates. Provide numeric lat and lng.", 400)

    if lat_num != lat_num or lng_num != lng_num:  # NaN guard
        raise ApiError("Invalid geo-coordinates. Provide numeric lat and lng.", 400)

    try:
        rad_num = int(float(radius))
    except (TypeError, ValueError):
        rad_num = 1000

    if lat_num < -90 or lat_num > 90 or lng_num < -180 or lng_num > 180:
        raise ApiError("Coordinates out of terrestrial bounds.", 400)

    return {
        "lat": lat_num,
        "lng": lng_num,
        "radius": min(max(rad_num, 100), 10000),  # 100 m to 10 km bounds
    }
