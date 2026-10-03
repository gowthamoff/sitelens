"""Port of server/routes/competitors.js — all endpoints require auth."""
from fastapi import APIRouter, Depends
from pydantic import ValidationError

from ..auth import require_auth
from ..common import ApiError, success, validate_site_params
from ..schemas.site import CompetitorQuery, competitor_error_message
from ..services.competitor import (
    VALID_TYPES, competitor_analysis, competitor_context, opportunity_gaps,
)

router = APIRouter(prefix="/api/competitors", dependencies=[Depends(require_auth)])


def _business_type(business_type):
    bt = business_type or "restaurant"
    if bt not in VALID_TYPES:
        raise ApiError(f"Invalid business_type. Use one of: {', '.join(VALID_TYPES)}", 400)
    return bt


def _competitor_query(lat: str = None, lng: str = None, radius: str = None,
                      business_type: str = "restaurant") -> CompetitorQuery:
    try:
        return CompetitorQuery(lat=lat, lng=lng, radius=radius, business_type=business_type)
    except ValidationError as e:
        raise ApiError(competitor_error_message(e), 400)


@router.get("")
def competitors(q: CompetitorQuery = Depends(_competitor_query)):
    return success(competitor_analysis(q.model_dump()))


@router.get("/gaps")
def gaps(lat: str = None, lng: str = None, radius: str = None, business_type: str = "restaurant"):
    params = validate_site_params(lat, lng, radius)
    params["business_type"] = _business_type(business_type)
    return success(opportunity_gaps(params))


@router.get("/context")
def context(comp_lng: str = None, comp_lat: str = None, site_lng: str = None, site_lat: str = None):
    try:
        vals = [float(comp_lng), float(comp_lat), float(site_lng), float(site_lat)]
    except (TypeError, ValueError):
        raise ApiError("comp_lng, comp_lat, site_lng, site_lat are all required numeric values", 400)
    data = competitor_context(comp_lng=vals[0], comp_lat=vals[1], site_lng=vals[2], site_lat=vals[3])
    return success(data)
