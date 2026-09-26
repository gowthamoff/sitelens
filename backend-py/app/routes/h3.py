"""H3 hex-aggregation endpoints (requires auth, like the other analysis routes)."""
from fastapi import APIRouter, Depends

from ..auth import require_auth
from ..common import ApiError, success, validate_site_params
from ..services.h3_density import h3_density, h3_density_precomputed

router = APIRouter(prefix="/api/h3", dependencies=[Depends(require_auth)])


@router.get("/density")
def density(lat: str = None, lng: str = None, radius: str = None, resolution: str = "9"):
    params = validate_site_params(lat, lng, radius)
    return success(h3_density(params, resolution=resolution))


@router.get("/density/precomputed")
def density_precomputed(min_lng: str = None, min_lat: str = None,
                        max_lng: str = None, max_lat: str = None):
    """Whole-dataset density from the pre-aggregated h3_poi_density table.
    Pass all four bbox params to narrow to a viewport, or none for everything."""
    corners = (min_lng, min_lat, max_lng, max_lat)
    bbox = None
    if any(c is not None for c in corners):
        try:
            bbox = tuple(float(c) for c in corners)
        except (TypeError, ValueError):
            raise ApiError("bbox needs all four numeric corners: min_lng, min_lat, max_lng, max_lat.", 400)
    return success(h3_density_precomputed(bbox=bbox))
