"""
NDVI Service — FastAPI Application

This is the equivalent of your Express app.js. It defines routes,
handles errors, and wires everything together.

Runs on port 8000 inside the Docker container.
Your Node.js backend calls this on localhost:8000.
"""

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from datetime import date
import logging
import time

from .models import (
    NDVISnapshotRequest,
    NDVISnapshotResponse,
    NDVITimeseriesRequest,
    NDVITimeseriesResponse,
    TimeseriesPoint,
)
from .stac_client import get_best_scene, search_monthly_scenes
from .ndvi import build_snapshot_response, compute_ndvi_from_item, get_health_label
import numpy as np

# ─── APP SETUP ────────────────────────────────────────────────

app = FastAPI(
    title="NDVI Analysis Service",
    description="Satellite vegetation analysis via Microsoft Planetary Computer",
    version="1.0.0",
)

# CORS — only needed if frontend calls this directly (shouldn't in prod)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["POST"],
    allow_headers=["*"],
)

# Logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("ndvi-service")


# ─── HEALTH CHECK ─────────────────────────────────────────────

@app.get("/health")
async def health():
    """ALB health check endpoint."""
    return {"status": "healthy", "service": "ndvi"}


# ─── SNAPSHOT ENDPOINT ────────────────────────────────────────

@app.post("/ndvi/snapshot", response_model=NDVISnapshotResponse)
async def ndvi_snapshot(req: NDVISnapshotRequest):
    """
    Compute NDVI for a single date.

    Flow:
    1. Validate geometry
    2. Search Planetary Computer for best scene
    3. Download Red + NIR bands (clipped to AOI)
    4. Compute NDVI
    5. Return stats + preview image

    Takes 5-30 seconds depending on AOI size and network.
    """
    start_time = time.time()
    logger.info(f"Snapshot request: cloud<={req.max_cloud_cover}%, date={req.target_date}")

    # ── Validate geometry type ──
    geom_type = req.geometry.get("type", "")
    if geom_type not in ("Polygon", "MultiPolygon"):
        raise HTTPException(
            status_code=400,
            detail=f"Geometry must be Polygon or MultiPolygon, got '{geom_type}'"
        )

    # ── Validate coordinates exist ──
    coords = req.geometry.get("coordinates")
    if not coords or not coords[0]:
        raise HTTPException(status_code=400, detail="Geometry has no coordinates")

    # ── Search for scene ──
    try:
        scene = get_best_scene(
            geometry=req.geometry,
            target_date=req.target_date,
            max_cloud_cover=req.max_cloud_cover,
        )
    except Exception as e:
        logger.error(f"STAC search failed: {e}")
        raise HTTPException(
            status_code=502,
            detail="Failed to search Planetary Computer. Try again later."
        )

    if scene is None:
        raise HTTPException(
            status_code=404,
            detail=(
                f"No cloud-free Sentinel-2 imagery found for this area "
                f"(cloud cover < {req.max_cloud_cover}%). "
                f"Try increasing max_cloud_cover or choosing a different date range."
            )
        )

    # ── Compute NDVI ──
    try:
        response = build_snapshot_response(scene, req.geometry)
    except ValueError as e:
        # AOI too large
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"NDVI computation failed: {e}")
        raise HTTPException(
            status_code=500,
            detail="NDVI computation failed. The satellite data may be corrupted. Try a different date."
        )

    elapsed = time.time() - start_time
    logger.info(
        f"Snapshot complete: mean_ndvi={response.mean_ndvi}, "
        f"scene={response.scene.scene_id}, took={elapsed:.1f}s"
    )

    return response


# ─── TIMESERIES ENDPOINT ──────────────────────────────────────

@app.post("/ndvi/timeseries", response_model=NDVITimeseriesResponse)
async def ndvi_timeseries(req: NDVITimeseriesRequest):
    """
    Compute NDVI over a date range (monthly data points).

    This is the "killer feature" — shows vegetation change over time.
    Takes 30-120 seconds depending on date range (one STAC query per month).
    """
    start_time = time.time()
    logger.info(f"Timeseries request: {req.start_date} to {req.end_date}")

    # ── Validate geometry ──
    if req.geometry.get("type") not in ("Polygon", "MultiPolygon"):
        raise HTTPException(status_code=400, detail="Geometry must be Polygon or MultiPolygon")

    # ── Validate date range ──
    if req.start_date >= req.end_date:
        raise HTTPException(status_code=400, detail="start_date must be before end_date")

    max_months = 24
    month_diff = (req.end_date.year - req.start_date.year) * 12 + req.end_date.month - req.start_date.month
    if month_diff > max_months:
        raise HTTPException(
            status_code=400,
            detail=f"Date range too large. Maximum {max_months} months."
        )

    # ── Find best scene per month ──
    try:
        monthly_scenes = search_monthly_scenes(
            geometry=req.geometry,
            start_date=req.start_date,
            end_date=req.end_date,
            max_cloud_cover=req.max_cloud_cover,
        )
    except Exception as e:
        logger.error(f"Monthly STAC search failed: {e}")
        raise HTTPException(status_code=502, detail="Failed to search Planetary Computer.")

    if not monthly_scenes:
        raise HTTPException(
            status_code=404,
            detail="No usable imagery found for any month in the date range."
        )

    # ── Compute NDVI for each month ──
    points: list[TimeseriesPoint] = []

    for month_date, scene in monthly_scenes:
        try:
            result = compute_ndvi_from_item(scene, req.geometry)
            valid = result["ndvi"][~np.isnan(result["ndvi"])]
            mean_val = float(np.mean(valid))

            points.append(TimeseriesPoint(
                date=result["scene_date"],
                mean_ndvi=round(mean_val, 4),
                cloud_cover=result["cloud_cover"],
                scene_id=result["scene_id"],
            ))
        except Exception as e:
            # Skip months where computation fails (corrupted data, etc.)
            logger.warning(f"Skipping {month_date}: {e}")
            continue

    if not points:
        raise HTTPException(status_code=404, detail="NDVI computation failed for all months.")

    # ── Calculate trend ──
    start_val = points[0].mean_ndvi
    end_val = points[-1].mean_ndvi

    if start_val == 0:
        delta_pct = 0.0
    else:
        delta_pct = round(((end_val - start_val) / abs(start_val)) * 100, 1)

    # Trend classification
    if delta_pct > 5:
        trend = "increasing"
    elif delta_pct < -5:
        trend = "decreasing"
    else:
        trend = "stable"

    elapsed = time.time() - start_time
    logger.info(f"Timeseries complete: {len(points)} points, trend={trend}, took={elapsed:.1f}s")

    return NDVITimeseriesResponse(
        points=points,
        trend=trend,
        start_value=start_val,
        end_value=end_val,
        delta_percent=delta_pct,
    )
