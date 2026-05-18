"""
Request and response models for the NDVI service.
Think of these like Zod schemas in TypeScript — they validate
incoming data and define the shape of responses.
"""

from pydantic import BaseModel, Field
from typing import Optional
from datetime import date


# ─── REQUEST MODELS ───────────────────────────────────────────

class NDVISnapshotRequest(BaseModel):
    """What the Node.js backend sends for a single-date NDVI analysis."""

    # GeoJSON geometry — same format your frontend sends after drawing
    geometry: dict = Field(
        ...,
        description="GeoJSON Polygon or MultiPolygon geometry",
        examples=[{
            "type": "Polygon",
            "coordinates": [[[79.94, 12.95], [80.00, 12.95],
                             [80.00, 13.00], [79.94, 13.00],
                             [79.94, 12.95]]]
        }]
    )

    # Target date — defaults to today
    target_date: Optional[date] = Field(
        default=None,
        description="Date to analyze. Defaults to most recent available."
    )

    # How much cloud is acceptable (0-100)
    max_cloud_cover: int = Field(
        default=15,
        ge=0,
        le=100,
        description="Maximum cloud cover percentage"
    )


class NDVITimeseriesRequest(BaseModel):
    """What the Node.js backend sends for time-series analysis."""

    geometry: dict
    start_date: date
    end_date: date
    max_cloud_cover: int = Field(default=20, ge=0, le=100)

    # "month" = one data point per month (default)
    # "week"  = one data point per week (more API calls, slower)
    interval: str = Field(default="month", pattern="^(week|month)$")


# ─── RESPONSE MODELS ─────────────────────────────────────────

class VegetationBreakdown(BaseModel):
    """Pixel classification into vegetation categories."""
    water_or_shadow: float = Field(description="% of pixels with NDVI < 0")
    barren_or_built: float = Field(description="% of pixels with NDVI 0–0.2")
    sparse_vegetation: float = Field(description="% of pixels with NDVI 0.2–0.4")
    moderate_vegetation: float = Field(description="% of pixels with NDVI 0.4–0.6")
    dense_vegetation: float = Field(description="% of pixels with NDVI ≥ 0.6")


class SceneMetadata(BaseModel):
    """Info about the satellite image used."""
    scene_id: str
    scene_date: date
    cloud_cover: float
    platform: str  # "Sentinel-2A" or "Sentinel-2B"


class NDVISnapshotResponse(BaseModel):
    """Full response for a snapshot analysis."""
    mean_ndvi: float
    min_ndvi: float
    max_ndvi: float
    std_ndvi: float
    health_label: str          # "Dense Vegetation", "Moderate", "Sparse", "Barren"
    breakdown: VegetationBreakdown
    scene: SceneMetadata
    preview_png_base64: str    # Colorized NDVI image for map overlay


class TimeseriesPoint(BaseModel):
    """One data point in the time series."""
    date: date
    mean_ndvi: float
    cloud_cover: float
    scene_id: str


class NDVITimeseriesResponse(BaseModel):
    """Full response for time-series analysis."""
    points: list[TimeseriesPoint]
    trend: str                 # "increasing", "decreasing", "stable"
    start_value: float
    end_value: float
    delta_percent: float       # e.g., +12.5 or -8.3
