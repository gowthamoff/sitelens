"""Port of server/services/environmentService.js."""
import math

from .. import db
from ..util import gather


def environmental_scan(params):
    lng, lat, radius = params["lng"], params["lat"], params["radius"]

    water_sql = """
    WITH circle AS (
      SELECT ST_Buffer(
        ST_SetSRID(ST_MakePoint(%(lng)s, %(lat)s), 4326)::geography, %(radius)s
      )::geometry AS geom
    )
    SELECT
      COALESCE(water, waterway, "natural", 'water') AS water_type,
      ROUND(
        SUM(
          ST_Area(
            ST_Intersection(p.way, (SELECT geom FROM circle))::geography
          )
        )::numeric, 2
      ) AS area_m2
    FROM planet_osm_polygon p, circle
    WHERE (water IS NOT NULL OR waterway IS NOT NULL OR "natural" IN ('water','wetland'))
      AND ST_Intersects(p.way, circle.geom)
    GROUP BY water_type
    HAVING SUM(ST_Area(ST_Intersection(p.way, circle.geom)::geography)) > 0
    ORDER BY area_m2 DESC;
    """

    green_sql = """
    WITH circle AS (
      SELECT ST_Buffer(
        ST_SetSRID(ST_MakePoint(%(lng)s, %(lat)s), 4326)::geography, %(radius)s
      )::geometry AS geom
    )
    SELECT
      COALESCE(landuse, leisure, "natural") AS green_type,
      ROUND(
        SUM(
          ST_Area(
            ST_Intersection(p.way, (SELECT geom FROM circle))::geography
          )
        )::numeric, 2
      ) AS area_m2
    FROM planet_osm_polygon p, circle
    WHERE (
      landuse IN ('forest','meadow','orchard','vineyard','allotments')
      OR leisure IN ('park','garden','nature_reserve')
      OR "natural" IN ('wood','scrub','grassland','heath')
    )
      AND ST_Intersects(p.way, circle.geom)
    GROUP BY green_type
    HAVING SUM(ST_Area(ST_Intersection(p.way, circle.geom)::geography)) > 0
    ORDER BY area_m2 DESC;
    """

    water_line_sql = """
    SELECT
      name,
      waterway,
      ROUND(ST_Distance(
        way::geography,
        ST_SetSRID(ST_MakePoint(%(lng)s, %(lat)s), 4326)::geography
      )::numeric, 2) AS distance_m
    FROM planet_osm_line
    WHERE waterway IN ('river','stream','canal','drain')
      AND ST_DWithin(
        way::geography,
        ST_SetSRID(ST_MakePoint(%(lng)s, %(lat)s), 4326)::geography,
        %(radius)s
      )
    ORDER BY distance_m
    LIMIT 5;
    """
    p = {"lng": lng, "lat": lat, "radius": radius}
    water_rows, green_rows, water_line_rows = gather(
        lambda: db.query(water_sql, p),
        lambda: db.query(green_sql, p),
        lambda: db.query(water_line_sql, p),
    )

    total_water = sum(db.num(r.get("area_m2")) for r in water_rows)
    total_green = sum(db.num(r.get("area_m2")) for r in green_rows)
    buffer_area = math.pi * radius * radius

    water_pct = min(100, round((total_water / buffer_area) * 10000) / 100)
    green_pct = min(100, round((total_green / buffer_area) * 10000) / 100)

    return {
        "water_bodies": db.jsonify([dict(r) for r in water_rows]),
        "green_spaces": db.jsonify([dict(r) for r in green_rows]),
        "nearby_waterways": db.jsonify([dict(r) for r in water_line_rows]),
        "summary": {
            "water_coverage_pct": water_pct,
            "green_coverage_pct": min(green_pct, max(0, 100 - water_pct)),
            "total_water_area_m2": round(total_water),
            "total_green_area_m2": round(total_green),
        },
    }
