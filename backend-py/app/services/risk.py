"""Port of server/services/riskService.js."""
from .. import db
from ..util import gather


def risk_assessment(params):
    lng, lat, radius = params["lng"], params["lat"], params["radius"]

    industrial_sql = """
    SELECT
      COALESCE(landuse, man_made) AS risk_type,
      COUNT(*) AS count,
      ROUND(MIN(ST_Distance(
        way::geography,
        ST_SetSRID(ST_MakePoint(%(lng)s, %(lat)s), 4326)::geography
      ))::numeric, 2) AS nearest_m,
      ROUND(SUM(ST_Area(way::geography))::numeric, 2) AS area_m2
    FROM planet_osm_polygon
    WHERE (
      landuse IN ('industrial','quarry','landfill','construction','brownfield')
      OR man_made IN ('wastewater_plant','water_works','petroleum_well','chimney')
    )
      AND ST_DWithin(
        way::geography,
        ST_SetSRID(ST_MakePoint(%(lng)s, %(lat)s), 4326)::geography,
        %(radius)s
      )
    GROUP BY risk_type
    ORDER BY nearest_m ASC;
    """

    power_sql = """
    SELECT power AS power_type, COUNT(*) AS count
    FROM planet_osm_point
    WHERE power IS NOT NULL
      AND ST_DWithin(
        way::geography,
        ST_SetSRID(ST_MakePoint(%(lng)s, %(lat)s), 4326)::geography,
        %(radius)s
      )
    GROUP BY power ORDER BY count DESC;
    """

    emergency_sql = """
    SELECT
      amenity AS type, name,
      ROUND(ST_Distance(
        way::geography,
        ST_SetSRID(ST_MakePoint(%(lng)s, %(lat)s), 4326)::geography
      )::numeric, 2) AS distance_m
    FROM planet_osm_point
    WHERE amenity IN ('hospital','fire_station','police','ambulance_station')
      AND ST_DWithin(
        way::geography,
        ST_SetSRID(ST_MakePoint(%(lng)s, %(lat)s), 4326)::geography,
        %(radius)s
      )
    ORDER BY distance_m ASC LIMIT 5;
    """
    p = {"lng": lng, "lat": lat, "radius": radius}
    indust_rows, power_rows, emerg_rows = gather(
        lambda: db.query(industrial_sql, p),
        lambda: db.query(power_sql, p),
        lambda: db.query(emergency_sql, p),
    )

    industrial_area = sum(db.num(r.get("area_m2")) for r in indust_rows)
    emergency_count = len(emerg_rows)
    risk_score = min(
        100,
        round((industrial_area / 10000) * 20 + max(0, 5 - emergency_count) * 10),
    )

    return {
        "industrial_risks": db.jsonify([dict(r) for r in indust_rows]),
        "power_infrastructure": db.jsonify([dict(r) for r in power_rows]),
        "emergency_services": db.jsonify([dict(r) for r in emerg_rows]),
        "risk_score": risk_score,
        "risk_level": "High" if risk_score >= 70 else "Moderate" if risk_score >= 40 else "Low",
    }
