"""Port of server/routes/geocode.js — requires auth. pg_trgm fuzzy search."""
from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse

from .. import db
from ..auth import require_auth

router = APIRouter(prefix="/api/v1/geocode", dependencies=[Depends(require_auth)])

_NOT_READY = {
    "error": "Geocode index not ready. Run the migration at docs/geocode_migration.sql first."
}


@router.get("")
def forward(q: str = None, limit: str = "6"):
    if not q or not isinstance(q, str) or len(q.strip()) < 2:
        return JSONResponse(status_code=400,
                            content={"error": "Query parameter `q` must be at least 2 characters."})
    search_term = q.strip()
    try:
        limit_i = int(float(limit or "6"))
    except (TypeError, ValueError):
        limit_i = 6

    sql = """
    SELECT * FROM (
      SELECT
        name, place_type, category,
        ST_Y(geom) AS lat,
        ST_X(geom) AS lng,
        similarity(name, %(q)s) AS sim
      FROM geocode_places
      WHERE name %% %(q)s
      ORDER BY name <-> %(q)s
      LIMIT 100
    ) AS candidates
    ORDER BY (sim *
      CASE category
        WHEN 'area' THEN 3.0
        WHEN 'road' THEN 2.0
        ELSE 1.0
      END
    ) DESC
    LIMIT %(limit)s
    """
    try:
        rows = db.query(sql, {"q": search_term, "limit": limit_i})
    except Exception as e:
        if "does not exist" in str(e):
            return JSONResponse(status_code=503, content=_NOT_READY)
        raise
    return db.jsonify([dict(r) for r in rows])


@router.get("/reverse")
def reverse(lat: str = None, lng: str = None):
    if not lat or not lng:
        return JSONResponse(status_code=400,
                            content={"error": "Both `lat` and `lng` query parameters are required."})
    try:
        latitude, longitude = float(lat), float(lng)
    except (TypeError, ValueError):
        return JSONResponse(status_code=400, content={"error": "lat and lng must be valid numbers."})

    sql = """
    SELECT
      name, place_type, category,
      ST_Distance(geog, ST_MakePoint(%(lng)s, %(lat)s)::geography) AS distance_m
    FROM geocode_places
    ORDER BY geog <-> ST_MakePoint(%(lng)s, %(lat)s)::geography
    LIMIT 1
    """
    try:
        row = db.query_one(sql, {"lng": longitude, "lat": latitude})
    except Exception as e:
        if "does not exist" in str(e):
            return JSONResponse(status_code=503, content=_NOT_READY)
        raise
    if not row:
        return JSONResponse(status_code=404, content={"error": "No places found near these coordinates."})
    return db.jsonify(dict(row))
