"""Port of server/services/connectivityService.js."""
import math

from .. import db
from ..util import gather


def connectivity_analysis(params):
    lng, lat, radius = params["lng"], params["lat"], params["radius"]
    buffer_area_km2 = (math.pi * radius * radius) / 1_000_000

    road_density_sql = """
    SELECT
      COUNT(*) AS road_segments,
      ROUND((SUM(ST_Length(way::geography)) / 1000)::numeric, 3) AS total_km
    FROM planet_osm_line
    WHERE highway IS NOT NULL
      AND highway NOT IN ('footway','path','cycleway','steps','pedestrian')
      AND ST_DWithin(
        way::geography,
        ST_SetSRID(ST_MakePoint(%(lng)s, %(lat)s), 4326)::geography,
        %(radius)s
      );
    """

    intersection_sql = """
    WITH road_nodes AS (
      SELECT unnest(ARRAY[ST_StartPoint(way), ST_EndPoint(way)]) AS node
      FROM planet_osm_line
      WHERE highway IS NOT NULL
        AND ST_DWithin(
          way::geography,
          ST_SetSRID(ST_MakePoint(%(lng)s, %(lat)s), 4326)::geography,
          %(radius)s
        )
    )
    SELECT COUNT(*) AS intersections
    FROM (
      SELECT node, COUNT(*) AS cnt
      FROM road_nodes
      GROUP BY node
      HAVING COUNT(*) >= 3
    ) t;
    """

    diversity_sql = """
    SELECT COUNT(DISTINCT highway) AS diversity_count
    FROM planet_osm_line
    WHERE highway IS NOT NULL
      AND ST_DWithin(
        way::geography,
        ST_SetSRID(ST_MakePoint(%(lng)s, %(lat)s), 4326)::geography,
        %(radius)s
      );
    """
    p = {"lng": lng, "lat": lat, "radius": radius}
    density_rows, inters_rows, divers_rows = gather(
        lambda: db.query(road_density_sql, p),
        lambda: db.query(intersection_sql, p),
        lambda: db.query(diversity_sql, p),
    )

    road_km = db.num(density_rows[0].get("total_km"))
    density = round((road_km / buffer_area_km2) * 100) / 100 if buffer_area_km2 else 0
    intersections = db.to_int(inters_rows[0].get("intersections"))
    diversity = db.to_int(divers_rows[0].get("diversity_count"))

    connectivity_index = min(100, round(density * 4 + intersections * 0.5 + diversity * 3))

    return {
        "road_segments": db.to_int(density_rows[0].get("road_segments")),
        "total_road_km": road_km,
        "road_density_km_per_km2": density,
        "intersection_count": intersections,
        "road_type_diversity": diversity,
        "connectivity_index": connectivity_index,
        "connectivity_grade": (
            "Excellent" if connectivity_index >= 80 else
            "Good" if connectivity_index >= 60 else
            "Fair" if connectivity_index >= 40 else "Poor"
        ),
    }
