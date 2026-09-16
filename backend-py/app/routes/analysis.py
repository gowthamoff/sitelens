"""Port of server/routes/analysis.js — all endpoints require auth."""
from fastapi import APIRouter, Depends

from ..auth import require_auth
from ..common import success, validate_site_params
from ..util import gather
from ..services.proximity import proximity_summary, nearest_neighbours
from ..services.landuse import land_use_breakdown, building_stats
from ..services.transport import transport_stats
from ..services.amenity import amenity_score
from ..services.environment import environmental_scan
from ..services.connectivity import connectivity_analysis
from ..services.risk import risk_assessment
from ..services.footfall import footfall_analysis

router = APIRouter(prefix="/api/analysis", dependencies=[Depends(require_auth)])


def _params(lat=None, lng=None, radius=None):
    return validate_site_params(lat, lng, radius)


@router.get("/proximity")
def proximity(lat: str = None, lng: str = None, radius: str = None):
    return success(proximity_summary(_params(lat, lng, radius)))


@router.get("/footfall")
def footfall(lat: str = None, lng: str = None, radius: str = None):
    return success(footfall_analysis(_params(lat, lng, radius)))


@router.get("/neighbours")
def neighbours(lat: str = None, lng: str = None, radius: str = None):
    return success(nearest_neighbours(_params(lat, lng, radius)))


@router.get("/landuse")
def landuse(lat: str = None, lng: str = None, radius: str = None):
    p = _params(lat, lng, radius)
    breakdown, buildings = gather(lambda: land_use_breakdown(p), lambda: building_stats(p))
    return success({"breakdown": breakdown, "buildings": buildings})


@router.get("/transport")
def transport(lat: str = None, lng: str = None, radius: str = None):
    return success(transport_stats(_params(lat, lng, radius)))


@router.get("/amenity-score")
def amenity(lat: str = None, lng: str = None, radius: str = None):
    return success(amenity_score(_params(lat, lng, radius)))


@router.get("/environment")
def environment(lat: str = None, lng: str = None, radius: str = None):
    return success(environmental_scan(_params(lat, lng, radius)))


@router.get("/connectivity")
def connectivity(lat: str = None, lng: str = None, radius: str = None):
    return success(connectivity_analysis(_params(lat, lng, radius)))


@router.get("/risk")
def risk(lat: str = None, lng: str = None, radius: str = None):
    return success(risk_assessment(_params(lat, lng, radius)))


@router.get("/full")
def full(lat: str = None, lng: str = None, radius: str = None):
    p = _params(lat, lng, radius)
    (proximity_r, neighbours_r, landuse_r, buildings_r, transport_r,
     amenity_r, environment_r, connectivity_r, risk_r, footfall_r) = gather(
        lambda: proximity_summary(p),
        lambda: nearest_neighbours(p),
        lambda: land_use_breakdown(p),
        lambda: building_stats(p),
        lambda: transport_stats(p),
        lambda: amenity_score(p),
        lambda: environmental_scan(p),
        lambda: connectivity_analysis(p),
        lambda: risk_assessment(p),
        lambda: footfall_analysis(p),
    )
    return success({
        "params": p,
        "data": {
            "proximity": proximity_r,
            "neighbours": neighbours_r,
            "landuse": {"breakdown": landuse_r, "buildings": buildings_r},
            "transport": transport_r,
            "amenity": amenity_r,
            "environment": environment_r,
            "connectivity": connectivity_r,
            "risk": risk_r,
            "footfall": footfall_r,
        },
    })
