"""
STAC Client — talks to Microsoft Planetary Computer.

This module handles:
1. Connecting to the STAC catalog
2. Searching for Sentinel-2 scenes over a given area and date range
3. Signing URLs (Planetary Computer requires this for download access)
4. Picking the best (least cloudy) scene

Think of this as the "data fetching" layer — it finds the right satellite
image but doesn't do any NDVI math.
"""

import pystac_client
import planetary_computer
from datetime import date, timedelta
from shapely.geometry import shape
from typing import Optional


# ─── CONNECT TO PLANETARY COMPUTER ───────────────────────────
# This is created once when the service starts (like a DB pool in Node.js).
# The modifier auto-signs every URL — without it you get 403 errors.

catalog = pystac_client.Client.open(
    "https://planetarycomputer.microsoft.com/api/stac/v1",
    modifier=planetary_computer.sign_inplace,
)


def search_scenes(
    geometry: dict,
    target_date: Optional[date] = None,
    max_cloud_cover: int = 15,
    days_window: int = 60,
) -> list:
    """
    Search for Sentinel-2 scenes covering the given geometry.

    Args:
        geometry:        GeoJSON dict (Polygon/MultiPolygon)
        target_date:     Center date for the search window (default: today)
        max_cloud_cover: Maximum acceptable cloud cover (0-100)
        days_window:     How many days before target_date to search

    Returns:
        List of STAC items, sorted by cloud cover (best first)
    """
    if target_date is None:
        target_date = date.today()

    # Search window: from (target_date - days_window) to target_date
    start = target_date - timedelta(days=days_window)
    date_range = f"{start.isoformat()}/{target_date.isoformat()}"

    search = catalog.search(
        collections=["sentinel-2-l2a"],       # Level-2A = atmospherically corrected
        intersects=geometry,                    # Only scenes covering our AOI
        datetime=date_range,
        query={"eo:cloud_cover": {"lt": max_cloud_cover}},
    )

    items = list(search.items())

    # Sort by cloud cover — least cloudy first
    items.sort(key=lambda i: i.properties["eo:cloud_cover"])

    return items


def get_best_scene(
    geometry: dict,
    target_date: Optional[date] = None,
    max_cloud_cover: int = 15,
):
    """
    Get the single best (least cloudy) scene.

    Returns:
        A STAC item, or None if no scenes found

    Raises nothing — the caller handles the None case.
    """
    items = search_scenes(geometry, target_date, max_cloud_cover)

    if not items:
        # Retry with wider cloud filter if nothing found
        items = search_scenes(geometry, target_date, min(max_cloud_cover + 20, 50))

    if not items:
        return None

    return items[0]


def search_monthly_scenes(
    geometry: dict,
    start_date: date,
    end_date: date,
    max_cloud_cover: int = 20,
) -> list:
    """
    Find the best scene for each month in the date range.
    Used for time-series analysis.

    Returns:
        List of (month_date, stac_item) tuples, one per month.
        Months with no usable imagery are skipped.
    """
    results = []
    current = start_date.replace(day=1)  # Start from first of the month

    while current <= end_date:
        # Search window = this entire month
        month_end = (current.replace(day=28) + timedelta(days=4)).replace(day=1) - timedelta(days=1)
        if month_end > end_date:
            month_end = end_date

        items = search_scenes(
            geometry=geometry,
            target_date=month_end,
            max_cloud_cover=max_cloud_cover,
            days_window=(month_end - current).days + 1,
        )

        if items:
            results.append((current, items[0]))

        # Move to next month
        current = (current.replace(day=28) + timedelta(days=4)).replace(day=1)

    return results
