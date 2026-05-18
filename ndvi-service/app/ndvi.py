"""
NDVI Computation Engine.

This module handles:
1. Loading Red (B04) and NIR (B08) bands from a STAC item
2. Computing NDVI: (NIR - Red) / (NIR + Red)
3. Classifying pixels into vegetation categories
4. Generating a colorized PNG preview for map overlay
5. Aggregating statistics

This is your Jupyter notebook logic, productionized.
"""

import numpy as np
import io
import base64
from PIL import Image
from shapely.geometry import shape
from odc.stac import load
from datetime import date
from .models import (
    NDVISnapshotResponse,
    VegetationBreakdown,
    SceneMetadata,
)

# ─── CONFIGURATION ────────────────────────────────────────────

# Max AOI area in square degrees (~500 km² at equator)
# Prevents memory explosions from huge polygons
MAX_AOI_AREA_DEG = 0.05

# NDVI classification thresholds
CLASSES = {
    "water_or_shadow":      (-1.0, 0.0),
    "barren_or_built":      (0.0, 0.2),
    "sparse_vegetation":    (0.2, 0.4),
    "moderate_vegetation":  (0.4, 0.6),
    "dense_vegetation":     (0.6, 1.0),
}

# Health labels based on mean NDVI
def get_health_label(mean_ndvi: float) -> str:
    if mean_ndvi < 0:
        return "Water / Shadow"
    elif mean_ndvi < 0.2:
        return "Barren / Built-up"
    elif mean_ndvi < 0.4:
        return "Sparse Vegetation"
    elif mean_ndvi < 0.6:
        return "Moderate Vegetation"
    else:
        return "Dense Vegetation"


# ─── CORE COMPUTATION ─────────────────────────────────────────

def compute_ndvi_from_item(stac_item, geometry: dict) -> dict:
    """
    Given a STAC item and a GeoJSON geometry, compute NDVI.

    Args:
        stac_item: A signed STAC item from Planetary Computer
        geometry:  GeoJSON dict defining the area of interest

    Returns:
        dict with ndvi_array, red_array, nir_array, and metadata

    This is the function that actually downloads satellite pixels
    and does the math. Expect 5-30 seconds depending on AOI size.
    """

    aoi = shape(geometry)

    # ── Validate AOI size ──
    if aoi.area > MAX_AOI_AREA_DEG:
        raise ValueError(
            f"AOI too large ({aoi.area:.4f} sq degrees). "
            f"Maximum is {MAX_AOI_AREA_DEG} sq degrees (~500 km²). "
            f"Draw a smaller polygon."
        )

    # ── Load Red + NIR bands, clipped to AOI ──
    # This downloads only the pixels we need (COG magic)
    data = load(
        [stac_item],
        bands=["B04", "B08"],          # Red and NIR
        geopolygon=aoi,                # Clip to our polygon
        chunks={},                     # Enable lazy/chunked loading
        crs="EPSG:4326",              # Output in lat/lon
        resolution=0.0001,            # ~11m per pixel
    ).squeeze()                        # Remove single-timestamp dimension

    # ── Extract as float arrays ──
    red = data.B04.values.astype("float32")
    nir = data.B08.values.astype("float32")

    # ── Compute NDVI ──
    # Suppress division-by-zero warnings (we handle NaN below)
    with np.errstate(divide="ignore", invalid="ignore"):
        ndvi = (nir - red) / (nir + red)

    # Clip to valid range
    ndvi = np.clip(ndvi, -1.0, 1.0)

    return {
        "ndvi": ndvi,
        "red": red,
        "nir": nir,
        "scene_id": stac_item.id,
        "scene_date": stac_item.datetime.date(),
        "cloud_cover": stac_item.properties["eo:cloud_cover"],
        "platform": stac_item.properties.get("platform", "unknown"),
    }


# ─── CLASSIFICATION ───────────────────────────────────────────

def classify_pixels(ndvi: np.ndarray) -> VegetationBreakdown:
    """
    Classify NDVI pixels into vegetation categories.
    Returns percentages for each class.
    """
    flat = ndvi.flatten()
    flat = flat[~np.isnan(flat)]  # Drop NaN pixels (outside polygon)
    total = len(flat)

    if total == 0:
        return VegetationBreakdown(
            water_or_shadow=0, barren_or_built=0,
            sparse_vegetation=0, moderate_vegetation=0,
            dense_vegetation=0,
        )

    percentages = {}
    for class_name, (low, high) in CLASSES.items():
        count = np.sum((flat >= low) & (flat < high))
        percentages[class_name] = round(100 * count / total, 1)

    # Fix: dense_vegetation should include exactly 1.0
    percentages["dense_vegetation"] = round(
        100 * np.sum(flat >= 0.6) / total, 1
    )

    return VegetationBreakdown(**percentages)


# ─── PREVIEW IMAGE GENERATION ─────────────────────────────────

def generate_preview_png(ndvi: np.ndarray, width: int = 400) -> str:
    """
    Generate a colorized NDVI image as base64 PNG.

    Color ramp:
      brown (#8B4513) → tan → yellow → light green → dark green (#006400)

    This image gets overlaid on the MapLibre map in your frontend.
    Returns a base64-encoded PNG string.
    """

    # ── Build color ramp ──
    # 5 colors: brown → tan → yellow → light green → dark green
    colors = [
        (139, 69, 19),     # Brown (barren)
        (210, 180, 140),   # Tan
        (255, 255, 224),   # Light yellow
        (144, 238, 144),   # Light green
        (0, 100, 0),       # Dark green (dense vegetation)
    ]

    # Map NDVI values (-0.2 to 0.8) to 0-255 range
    normalized = np.clip((ndvi + 0.2) / 1.0, 0, 1)  # 0 to 1

    # Create RGB image
    h, w = ndvi.shape
    rgb = np.zeros((h, w, 4), dtype=np.uint8)  # RGBA

    for i in range(h):
        for j in range(w):
            val = normalized[i, j]
            if np.isnan(ndvi[i, j]):
                rgb[i, j] = [0, 0, 0, 0]  # Transparent for NaN
                continue

            # Interpolate between color stops
            idx = val * (len(colors) - 1)
            low_idx = int(idx)
            high_idx = min(low_idx + 1, len(colors) - 1)
            frac = idx - low_idx

            r = int(colors[low_idx][0] * (1 - frac) + colors[high_idx][0] * frac)
            g = int(colors[low_idx][1] * (1 - frac) + colors[high_idx][1] * frac)
            b = int(colors[low_idx][2] * (1 - frac) + colors[high_idx][2] * frac)
            rgb[i, j] = [r, g, b, 180]  # Semi-transparent

    # ── Resize if needed ──
    img = Image.fromarray(rgb, "RGBA")
    if w > width:
        ratio = width / w
        img = img.resize((width, int(h * ratio)), Image.LANCZOS)

    # ── Encode to base64 ──
    buffer = io.BytesIO()
    img.save(buffer, format="PNG", optimize=True)
    return base64.b64encode(buffer.getvalue()).decode("utf-8")


# Faster vectorized version of the preview generator
def generate_preview_png_fast(ndvi: np.ndarray, width: int = 400) -> str:
    """
    Vectorized version — much faster than the pixel-by-pixel loop above.
    Use this one in production.
    """

    # Color stops: (ndvi_value, R, G, B)
    stops = np.array([
        [-0.2, 139, 69, 19],
        [0.0, 210, 180, 140],
        [0.3, 255, 255, 224],
        [0.5, 144, 238, 144],
        [0.8, 0, 100, 0],
    ], dtype=np.float32)

    # Normalize NDVI to 0-1 range
    normalized = np.clip((ndvi + 0.2) / 1.0, 0, 1)

    # Interpolate each channel
    xp = np.linspace(0, 1, len(stops))
    h, w = ndvi.shape
    flat = normalized.flatten()

    r = np.interp(flat, xp, stops[:, 1]).reshape(h, w).astype(np.uint8)
    g = np.interp(flat, xp, stops[:, 2]).reshape(h, w).astype(np.uint8)
    b = np.interp(flat, xp, stops[:, 3]).reshape(h, w).astype(np.uint8)

    # Alpha: transparent for NaN, semi-transparent for valid
    alpha = np.where(np.isnan(ndvi), 0, 180).astype(np.uint8)

    # Stack into RGBA
    rgba = np.stack([r, g, b, alpha], axis=-1)

    # Resize
    img = Image.fromarray(rgba, "RGBA")
    if w > width:
        ratio = width / w
        img = img.resize((width, int(h * ratio)), Image.LANCZOS)

    # Encode
    buffer = io.BytesIO()
    img.save(buffer, format="PNG", optimize=True)
    return base64.b64encode(buffer.getvalue()).decode("utf-8")


# ─── FULL SNAPSHOT PIPELINE ───────────────────────────────────

def build_snapshot_response(stac_item, geometry: dict) -> NDVISnapshotResponse:
    """
    Complete pipeline: STAC item → NDVI → stats → preview → response.
    This is what the /ndvi/snapshot endpoint calls.
    """

    # Step 1: Compute NDVI
    result = compute_ndvi_from_item(stac_item, geometry)
    ndvi = result["ndvi"]

    # Step 2: Calculate stats (ignore NaN pixels)
    valid = ndvi[~np.isnan(ndvi)]
    mean_val = float(np.mean(valid))
    min_val = float(np.min(valid))
    max_val = float(np.max(valid))
    std_val = float(np.std(valid))

    # Step 3: Classify pixels
    breakdown = classify_pixels(ndvi)

    # Step 4: Generate preview image
    preview = generate_preview_png_fast(ndvi)

    # Step 5: Build response
    return NDVISnapshotResponse(
        mean_ndvi=round(mean_val, 4),
        min_ndvi=round(min_val, 4),
        max_ndvi=round(max_val, 4),
        std_ndvi=round(std_val, 4),
        health_label=get_health_label(mean_val),
        breakdown=breakdown,
        scene=SceneMetadata(
            scene_id=result["scene_id"],
            scene_date=result["scene_date"],
            cloud_cover=result["cloud_cover"],
            platform=result["platform"],
        ),
        preview_png_base64=preview,
    )
