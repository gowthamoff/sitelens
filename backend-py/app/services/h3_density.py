"""
H3 POI-density serving — reads the pre-aggregated `h3_poi_density` table
(built by app/tools/h3_precompute.py, refreshed by the Airflow DAG) and
returns GeoJSON hexagons with a point count + normalized weight.

Why H3: counting POIs per hexagon is just a dict tally on an integer cell id —
no spatial join — which is exactly why H3 scales to millions of points. The
counting happens once, offline; this module only serves the result.
"""
import json

from .. import db


def h3_density_precomputed(bbox=None):
    """Whole-dataset density from the batch-built h3_poi_density table.

    Optional bbox = (min_lng, min_lat, max_lng, max_lat) narrows to the
    viewport via the table's GiST index.
    """
    sql = """
      SELECT h3, resolution, count, ST_AsGeoJSON(geom) AS geometry
      FROM h3_poi_density
    """
    params = {}
    if bbox:
        sql += " WHERE geom && ST_MakeEnvelope(%(min_lng)s, %(min_lat)s, %(max_lng)s, %(max_lat)s, 4326)"
        params = {
            "min_lng": bbox[0], "min_lat": bbox[1],
            "max_lng": bbox[2], "max_lat": bbox[3],
        }
    rows = db.query(sql, params)

    max_count = max((r["count"] for r in rows), default=1)
    features = [{
        "type": "Feature",
        "geometry": json.loads(r["geometry"]),
        "properties": {
            "h3": r["h3"],
            "count": r["count"],
            "weight": round(r["count"] / max_count, 3),
            "resolution": r["resolution"],
        },
    } for r in rows]

    return {
        "type": "FeatureCollection",
        "features": features,
        "meta": {
            "cells": len(features),
            "max_count": max_count,
            "source": "precomputed",
        },
    }
