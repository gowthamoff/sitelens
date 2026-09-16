"""Port of server/services/landUseService.js."""
from .. import db


def land_use_breakdown(params):
    lng, lat, radius = params["lng"], params["lat"], params["radius"]
    sql = """
    WITH site_geo AS (
      SELECT ST_SetSRID(ST_MakePoint(%(lng)s, %(lat)s), 4326)::geography AS center
    ),
    clipped AS (
      SELECT
        COALESCE(p.landuse, p."natural", p.leisure, 'other') AS category,
        ST_Area(p.way::geography) AS raw_area,
        ST_Area(
          ST_Intersection(
            p.way,
            ST_Buffer(ST_SetSRID(ST_MakePoint(%(lng)s,%(lat)s),4326)::geography, %(radius)s)::geometry
          )::geography
        ) AS clipped_area
      FROM planet_osm_polygon p
      WHERE (p.landuse IS NOT NULL OR p."natural" IS NOT NULL OR p.leisure IS NOT NULL)
        AND ST_DWithin(
          p.way::geography,
          ST_SetSRID(ST_MakePoint(%(lng)s, %(lat)s), 4326)::geography,
          %(radius)s
        )
    ),
    totals AS (
      SELECT SUM(clipped_area) AS grand_total FROM clipped
    )
    SELECT
      category,
      ROUND(SUM(clipped_area)::numeric, 2) AS area_m2,
      ROUND((SUM(clipped_area) / NULLIF((SELECT grand_total FROM totals), 0) * 100)::numeric, 2) AS pct
    FROM clipped
    GROUP BY category
    ORDER BY area_m2 DESC;
    """
    rows = db.query(sql, {"lng": lng, "lat": lat, "radius": radius})
    return db.jsonify([dict(r) for r in rows])


def building_stats(params):
    lng, lat, radius = params["lng"], params["lat"], params["radius"]
    sql = """
    SELECT
      COUNT(*) AS building_count,
      ROUND(SUM(ST_Area(way::geography))::numeric, 2) AS total_footprint_m2,
      ROUND(AVG(ST_Area(way::geography))::numeric, 2)  AS avg_footprint_m2,
      ROUND(
        (SUM(ST_Area(way::geography)) / NULLIF(PI() * %(radius)s * %(radius)s, 0) * 100)::numeric, 2
      ) AS coverage_pct
    FROM planet_osm_polygon
    WHERE building IS NOT NULL AND building <> 'no'
      AND ST_DWithin(
        way::geography,
        ST_SetSRID(ST_MakePoint(%(lng)s, %(lat)s), 4326)::geography,
        %(radius)s
      );
    """
    row = db.query_one(sql, {"lng": lng, "lat": lat, "radius": radius})
    return db.jsonify(dict(row))
