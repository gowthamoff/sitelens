"""Port of server/services/transportService.js."""
from .. import db
from ..util import gather


def transport_stats(params):
    lng, lat, radius = params["lng"], params["lat"], params["radius"]

    road_sql = """
    WITH clipped AS (
      SELECT
        highway,
        ST_Length(way::geography) AS seg_len
      FROM planet_osm_line
      WHERE highway IS NOT NULL
        AND way && ST_Expand(ST_SetSRID(ST_MakePoint(%(lng)s, %(lat)s), 4326), %(radius)s/111320.0)
        AND ST_DWithin(
          way::geography,
          ST_SetSRID(ST_MakePoint(%(lng)s, %(lat)s), 4326)::geography,
          %(radius)s
        )
    )
    SELECT
      highway AS road_type,
      COUNT(*) AS segment_count,
      ROUND(SUM(seg_len)::numeric, 2) AS total_length_m
    FROM clipped
    GROUP BY highway
    ORDER BY total_length_m DESC;
    """

    transit_sql = """
    SELECT
      SUM(CASE WHEN highway = 'bus_stop' THEN 1 ELSE 0 END) AS bus_stops,
      SUM(CASE WHEN railway IN ('station','halt','tram_stop','subway_entrance') THEN 1 ELSE 0 END) AS rail_stops,
      SUM(CASE WHEN amenity = 'ferry_terminal' THEN 1 ELSE 0 END) AS ferry_terminals
    FROM planet_osm_point
    WHERE ST_DWithin(
      way::geography,
      ST_SetSRID(ST_MakePoint(%(lng)s, %(lat)s), 4326)::geography,
      %(radius)s
    );
    """
    p = {"lng": lng, "lat": lat, "radius": radius}
    road_rows, transit_rows = gather(
        lambda: db.query(road_sql, p),
        lambda: db.query(transit_sql, p),
    )

    total_road_length = sum(db.num(r.get("total_length_m")) for r in road_rows)

    t0 = transit_rows[0]
    transit_count = db.to_int(t0.get("bus_stops")) + db.to_int(t0.get("rail_stops")) * 3
    walkability = min(
        100,
        round((total_road_length / 1000 + transit_count * 5) / (radius / 200)),
    )

    return {
        "road_types": db.jsonify([dict(r) for r in road_rows]),
        "transit": db.jsonify(dict(t0)),
        "total_road_length_m": round(total_road_length),
        "walkability_score": walkability,
    }
