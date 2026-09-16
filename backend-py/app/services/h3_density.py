"""
H3 hex-aggregation of POI density.

Bins OpenStreetMap points into Uber H3 cells and returns each cell as a GeoJSON
hexagon with a point count + normalized weight — a hexbin heatmap the map can
render as a single fill layer. This is the on-the-fly version (per location); the
batch ETL that pre-aggregates the whole dataset lives in app/tools/h3_precompute.py.

Why H3: counting POIs per hexagon is just a dict tally on an integer cell id —
no spatial join — which is exactly why H3 scales to millions of points.
"""
from collections import Counter

import h3

from .. import db

# POIs we consider "activity" points (same family the analysis endpoints use).
_POI_WHERE = "(amenity IS NOT NULL OR shop IS NOT NULL OR leisure IS NOT NULL OR tourism IS NOT NULL)"


def h3_density(params, resolution=9, limit=200000):
    """Return a GeoJSON FeatureCollection of H3 hexagons (POI counts) around a site."""
    lng, lat, radius = params["lng"], params["lat"], params["radius"]
    resolution = max(6, min(int(resolution), 11))  # sane H3 range for city work

    sql = f"""
      SELECT ST_Y(ST_Transform(way, 4326)) AS lat,
             ST_X(ST_Transform(way, 4326)) AS lng
      FROM planet_osm_point
      WHERE {_POI_WHERE}
        AND ST_DWithin(
          way::geography,
          ST_SetSRID(ST_MakePoint(%(lng)s, %(lat)s), 4326)::geography,
          %(radius)s
        )
      LIMIT %(limit)s
    """
    rows = db.query(sql, {"lng": lng, "lat": lat, "radius": radius, "limit": limit})

    # ── the H3 aggregation: point -> cell id -> tally (no spatial join) ──
    counts = Counter()
    for r in rows:
        counts[h3.latlng_to_cell(r["lat"], r["lng"], resolution)] += 1

    max_count = max(counts.values()) if counts else 1
    features = []
    for cell, c in counts.items():
        # cell_to_boundary returns (lat, lng) pairs; GeoJSON wants [lng, lat] rings.
        ring = [[lng_, lat_] for (lat_, lng_) in h3.cell_to_boundary(cell)]
        ring.append(ring[0])  # close the polygon
        features.append({
            "type": "Feature",
            "geometry": {"type": "Polygon", "coordinates": [ring]},
            "properties": {
                "h3": cell,
                "count": c,
                "weight": round(c / max_count, 3),  # 0..1 for the heat ramp
                "resolution": resolution,
            },
        })

    return {
        "type": "FeatureCollection",
        "features": features,
        "meta": {
            "cells": len(counts),
            "points": len(rows),
            "resolution": resolution,
            "max_count": max_count,
        },
    }
