"""Port of server/routes/cannibalization.js — requires auth."""
import json

from fastapi import APIRouter, Depends, Request
from fastapi.responses import JSONResponse

from .. import db
from ..auth import require_auth

router = APIRouter(prefix="/api", dependencies=[Depends(require_auth)])

WALK = 500
DELIVERY = 3000


@router.post("/cannibalization")
async def cannibalization(request: Request):
    body = await request.json()
    new_site = body.get("newSite") or {}
    existing = body.get("existingOutlets")

    if not new_site.get("lat") or not new_site.get("lng") or not isinstance(existing, list):
        return JSONResponse(status_code=400,
                            content={"error": "newSite{lat,lng} and existingOutlets[] required"})
    if len(existing) == 0:
        return {"newSite": new_site, "results": [],
                "verdict": {"level": "safe", "msg": "No existing outlets to compare against."}}

    sql = """
    WITH new_pt AS (SELECT ST_SetSRID(ST_MakePoint(%(lng)s, %(lat)s), 4326) AS g),
    outlets AS (
      SELECT * FROM unnest(%(outlets)s::jsonb[]) AS o(data)
    )
    SELECT
      (data->>'id') AS id,
      (data->>'name') AS name,
      ROUND(ST_Distance(
        (SELECT g FROM new_pt)::geography,
        ST_SetSRID(ST_MakePoint((data->>'lng')::float, (data->>'lat')::float), 4326)::geography
      )) AS distance_m,
      ROUND(GREATEST(0,
        ST_Area(ST_Intersection(
          ST_Buffer((SELECT g FROM new_pt)::geography, %(walk)s)::geometry,
          ST_Buffer(ST_SetSRID(ST_MakePoint((data->>'lng')::float, (data->>'lat')::float), 4326)::geography, %(walk)s)::geometry
        )) / NULLIF(ST_Area(ST_Buffer((SELECT g FROM new_pt)::geography, %(walk)s)::geometry), 0) * 100
      )) AS walk_overlap_pct,
      ROUND(GREATEST(0,
        ST_Area(ST_Intersection(
          ST_Buffer((SELECT g FROM new_pt)::geography, %(delivery)s)::geometry,
          ST_Buffer(ST_SetSRID(ST_MakePoint((data->>'lng')::float, (data->>'lat')::float), 4326)::geography, %(delivery)s)::geometry
        )) / NULLIF(ST_Area(ST_Buffer((SELECT g FROM new_pt)::geography, %(delivery)s)::geometry), 0) * 100
      )) AS delivery_overlap_pct
    FROM outlets;
    """
    try:
        rows = db.query(sql, {
            "lng": new_site["lng"], "lat": new_site["lat"],
            "outlets": [json.dumps(o) for o in existing],
            "walk": WALK, "delivery": DELIVERY,
        })
    except Exception as e:
        print(f"[Cannibalization] {e}")
        return JSONResponse(status_code=500, content={"error": "cannibalization query failed"})

    rows = db.jsonify([dict(r) for r in rows])
    return {"newSite": new_site, "results": rows, "verdict": _build_verdict(rows)}


def _build_verdict(rows):
    if not rows:
        return {"level": "safe", "msg": "No existing outlets to compare against."}
    max_del = max((db.num(r.get("delivery_overlap_pct")) for r in rows), default=0)
    max_walk = max((db.num(r.get("walk_overlap_pct")) for r in rows), default=0)
    if max_walk > 30:
        return {"level": "high",
                "msg": f"Walking catchment overlaps existing outlet by {_n(max_walk)}%. Direct cannibalization risk."}
    if max_del > 60:
        return {"level": "medium",
                "msg": f"Delivery zone overlaps existing outlet by {_n(max_del)}%. Expect 25-40% delivery cannibalization."}
    if max_del > 30:
        return {"level": "low", "msg": f"Delivery zone has {_n(max_del)}% overlap. Minor revenue impact."}
    return {"level": "safe", "msg": "No meaningful catchment overlap with existing outlets."}


def _n(v):
    # Render whole numbers without a trailing .0 to match JS number formatting.
    return int(v) if float(v).is_integer() else v
