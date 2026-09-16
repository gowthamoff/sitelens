"""H3 hex-aggregation endpoints (requires auth, like the other analysis routes)."""
from fastapi import APIRouter, Depends

from ..auth import require_auth
from ..common import success, validate_site_params
from ..services.h3_density import h3_density

router = APIRouter(prefix="/api/h3", dependencies=[Depends(require_auth)])


@router.get("/density")
def density(lat: str = None, lng: str = None, radius: str = None, resolution: str = "9"):
    params = validate_site_params(lat, lng, radius)
    return success(h3_density(params, resolution=resolution))
