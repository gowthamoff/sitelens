"""
Batch H3 aggregation ETL — precomputes POI density per H3 cell for the WHOLE
dataset into a `h3_poi_density` table.

This is the "data pipeline" version of services/h3_density.py:
  EXTRACT  stream every POI point (server-side cursor, no full materialization)
  TRANSFORM bin each point into an H3 cell id and tally counts (a dict, O(points))
  LOAD      write one row per cell (count + hexagon polygon), spatially indexed

Run inside the backend container:
    docker exec sitelens-backend python -m app.tools.h3_precompute 8
(the integer arg is the H3 resolution; default 8 ≈ ~0.7 km hexes).
"""
import sys
from collections import Counter

import h3
from psycopg.rows import tuple_row

from .. import db

_POI_WHERE = "(amenity IS NOT NULL OR shop IS NOT NULL OR leisure IS NOT NULL OR tourism IS NOT NULL)"


def precompute(resolution: int = 8):
    counts = Counter()

    # ── EXTRACT + TRANSFORM: stream points, bin into H3 cells ──
    with db.pool.connection() as conn:
        with conn.cursor(name="h3_stream", row_factory=tuple_row) as cur:
            cur.itersize = 50_000  # server-side cursor → streams, never loads all rows
            cur.execute(
                f"SELECT ST_Y(ST_Transform(way,4326)), ST_X(ST_Transform(way,4326)) "
                f"FROM planet_osm_point WHERE {_POI_WHERE}"
            )
            n = 0
            for lat, lng in cur:
                if lat is None or lng is None:
                    continue
                counts[h3.latlng_to_cell(lat, lng, resolution)] += 1
                n += 1
                if n % 200_000 == 0:
                    print(f"  binned {n:,} points -> {len(counts):,} cells")
    print(f"transform done: {n:,} points -> {len(counts):,} H3 cells at res {resolution}")

    # ── LOAD: one row per cell with its hexagon polygon ──
    insert_rows = []
    for cell, c in counts.items():
        ring = [(lng_, lat_) for (lat_, lng_) in h3.cell_to_boundary(cell)]
        ring.append(ring[0])
        wkt = "POLYGON((" + ",".join(f"{x} {y}" for x, y in ring) + "))"
        insert_rows.append((cell, resolution, c, wkt))

    with db.pool.connection() as conn:
        with conn.cursor() as cur:
            cur.execute("DROP TABLE IF EXISTS h3_poi_density")
            cur.execute(
                "CREATE TABLE h3_poi_density ("
                "  h3 text, resolution int, count int, geom geometry(Polygon, 4326))"
            )
            cur.executemany(
                "INSERT INTO h3_poi_density (h3, resolution, count, geom) "
                "VALUES (%s, %s, %s, ST_GeomFromText(%s, 4326))",
                insert_rows,
            )
            cur.execute("CREATE INDEX ON h3_poi_density USING gist (geom)")
            cur.execute("CREATE INDEX ON h3_poi_density (h3)")
        conn.commit()

    print(f"loaded h3_poi_density: {len(insert_rows):,} cells (res {resolution})")


if __name__ == "__main__":
    res = int(sys.argv[1]) if len(sys.argv) > 1 else 8
    precompute(res)
