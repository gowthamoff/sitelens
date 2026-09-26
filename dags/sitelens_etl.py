"""
SiteLens OSM ETL — extract → validate → transform → load → report.

Orchestrates the same pipeline the repo runs by hand (osm2pgsql import,
spatial migrations, H3 pre-aggregation, tile matview refresh) with the
properties the pieces alone don't give you:

  * freshness-aware — the source .pbf is hashed each run; an unchanged
    extract short-circuits the expensive import instead of re-running it
  * idempotent      — every step can re-run safely (osm2pgsql recreates its
    tables, the H3 build is drop-and-recreate, matview refresh is a refresh)
  * data-quality gate — row-count floors + geometry validity + SRID checks
    sit between load and the derived artifacts; a bad import never reaches
    the H3 table or the tile views
  * report          — one summary line per run with the numbers that matter

Config (env vars; see dags/README.md for the tunnel setup):
  SITELENS_DB_HOST / SITELENS_DB_PORT / SITELENS_DB_NAME / SITELENS_DB_USER /
  SITELENS_DB_PASS — Postgres/PostGIS target (RDS via the SSM tunnel, or local)
  SITELENS_PBF     — path to the OSM extract (default: repo data/region.osm.pbf)

Run without a scheduler:  airflow dags test sitelens_etl 2026-09-26
"""
import hashlib
import os
from datetime import datetime, timedelta

from airflow.decorators import dag, task
from airflow.exceptions import AirflowException
from airflow.models import Variable
from airflow.operators.empty import EmptyOperator

REPO = os.environ.get("SITELENS_REPO", "/mnt/d/demo/sitelens")
PBF = os.environ.get("SITELENS_PBF", f"{REPO}/data/region.osm.pbf")

# Quality-gate floors — tuned for the Chennai extract; raise for the full TN import.
MIN_POINTS = int(os.environ.get("SITELENS_MIN_POINTS", 10_000))
MIN_LINES = int(os.environ.get("SITELENS_MIN_LINES", 10_000))
MIN_POLYGONS = int(os.environ.get("SITELENS_MIN_POLYGONS", 10_000))

H3_RESOLUTION = int(os.environ.get("SITELENS_H3_RES", 8))


def _connect():
    import psycopg

    host = os.environ.get("SITELENS_DB_HOST", "localhost")
    password = os.environ.get("SITELENS_DB_PASS")
    if not password:
        raise AirflowException("SITELENS_DB_PASS is not set — see dags/README.md")
    return psycopg.connect(
        host=host,
        port=int(os.environ.get("SITELENS_DB_PORT", 5400)),
        dbname=os.environ.get("SITELENS_DB_NAME", "osm_tn"),
        user=os.environ.get("SITELENS_DB_USER", "postgres"),
        password=password,
        sslmode=os.environ.get("SITELENS_DB_SSLMODE", "require"),
    )


def _one(cur, sql, params=None):
    cur.execute(sql, params or ())
    return cur.fetchone()[0]


@dag(
    dag_id="sitelens_etl",
    description="OSM extract -> PostGIS load -> quality gate -> H3 + tile matviews -> report",
    schedule="@weekly",
    start_date=datetime(2026, 1, 1),
    catchup=False,
    default_args={"retries": 1, "retry_delay": timedelta(minutes=2)},
    tags=["sitelens", "geospatial"],
)
def sitelens_etl():

    @task
    def extract():
        """Hash the source extract; expose size + whether it changed since last run."""
        if not os.path.exists(PBF):
            raise AirflowException(f"source extract not found: {PBF}")
        h = hashlib.md5()
        with open(PBF, "rb") as f:
            for chunk in iter(lambda: f.read(1 << 20), b""):
                h.update(chunk)
        digest = h.hexdigest()
        previous = Variable.get("sitelens_pbf_md5", default_var=None)
        Variable.set("sitelens_pbf_md5", digest)
        return {
            "md5": digest,
            "size_mb": round(os.path.getsize(PBF) / 1e6, 1),
            "changed": digest != previous,
        }

    @task.branch
    def freshness_gate(source: dict):
        """Unchanged source -> skip the expensive import (idempotent re-runs)."""
        return "load_osm" if source["changed"] else "skip_load"

    @task
    def load_osm():
        """osm2pgsql import + spatial migrations (only when the extract changed)."""
        import shutil
        import subprocess

        if shutil.which("osm2pgsql") is None:
            raise AirflowException(
                "osm2pgsql not installed — apt-get install osm2pgsql, "
                "or run the import via the repo's osm-loader container"
            )
        env = os.environ.copy()
        env.update({
            "PGHOST": os.environ.get("SITELENS_DB_HOST", "localhost"),
            "PGPORT": os.environ.get("SITELENS_DB_PORT", "5400"),
            "PGDATABASE": os.environ.get("SITELENS_DB_NAME", "osm_tn"),
            "PGUSER": os.environ.get("SITELENS_DB_USER", "postgres"),
            "PGPASSWORD": os.environ.get("SITELENS_DB_PASS", ""),
        })
        subprocess.run(
            ["osm2pgsql", "-l", "--hstore", PBF],
            check=True, env=env,
        )
        for sql_file in ("add-demand-indexes.sql", "tile-mvs.sql"):
            subprocess.run(
                ["psql", "-v", "ON_ERROR_STOP=1", "-f", f"{REPO}/migrations/{sql_file}"],
                check=True, env=env,
            )

    skip_load = EmptyOperator(task_id="skip_load")

    @task(trigger_rule="none_failed_min_one_success")
    def validate():
        """Data-quality gate: row floors, geometry validity, SRID. Fail = stop the run."""
        checks = {}
        with _connect() as conn, conn.cursor() as cur:
            checks["points"] = _one(cur, "SELECT count(*) FROM planet_osm_point")
            checks["lines"] = _one(cur, "SELECT count(*) FROM planet_osm_line")
            checks["polygons"] = _one(cur, "SELECT count(*) FROM planet_osm_polygon")
            checks["invalid_geoms"] = _one(cur, """
                SELECT count(*) FROM (
                  SELECT way FROM planet_osm_polygon LIMIT 5000
                ) s WHERE NOT ST_IsValid(way)
            """)
            checks["srid"] = _one(cur, "SELECT ST_SRID(way) FROM planet_osm_point LIMIT 1")

        failures = []
        if checks["points"] < MIN_POINTS:
            failures.append(f"points {checks['points']} < floor {MIN_POINTS}")
        if checks["lines"] < MIN_LINES:
            failures.append(f"lines {checks['lines']} < floor {MIN_LINES}")
        if checks["polygons"] < MIN_POLYGONS:
            failures.append(f"polygons {checks['polygons']} < floor {MIN_POLYGONS}")
        if checks["invalid_geoms"] > 0:
            failures.append(f"{checks['invalid_geoms']} invalid geometries in sample")
        if checks["srid"] != 4326:
            failures.append(f"SRID {checks['srid']} != 4326")
        if failures:
            raise AirflowException("quality gate failed: " + "; ".join(failures))
        return checks

    @task
    def transform_h3(checks: dict):
        """Re-aggregate POIs into H3 cells (drop-and-recreate — idempotent)."""
        import h3 as h3lib
        from collections import Counter

        poi_where = ("(amenity IS NOT NULL OR shop IS NOT NULL "
                     "OR leisure IS NOT NULL OR tourism IS NOT NULL)")
        counts = Counter()
        with _connect() as conn:
            with conn.cursor(name="h3_stream") as cur:
                cur.itersize = 50_000
                cur.execute(
                    f"SELECT ST_Y(ST_Transform(way,4326)), ST_X(ST_Transform(way,4326)) "
                    f"FROM planet_osm_point WHERE {poi_where}"
                )
                for lat, lng in cur:
                    if lat is not None and lng is not None:
                        counts[h3lib.latlng_to_cell(lat, lng, H3_RESOLUTION)] += 1

            rows = []
            for cell, c in counts.items():
                ring = [(lng_, lat_) for (lat_, lng_) in h3lib.cell_to_boundary(cell)]
                ring.append(ring[0])
                wkt = "POLYGON((" + ",".join(f"{x} {y}" for x, y in ring) + "))"
                rows.append((cell, H3_RESOLUTION, c, wkt))

            with conn.cursor() as cur:
                cur.execute("DROP TABLE IF EXISTS h3_poi_density")
                cur.execute(
                    "CREATE TABLE h3_poi_density ("
                    " h3 text, resolution int, count int, geom geometry(Polygon, 4326))"
                )
                cur.executemany(
                    "INSERT INTO h3_poi_density (h3, resolution, count, geom) "
                    "VALUES (%s, %s, %s, ST_GeomFromText(%s, 4326))", rows
                )
                cur.execute("CREATE INDEX ON h3_poi_density USING gist (geom)")
                cur.execute("CREATE INDEX ON h3_poi_density (h3)")
            conn.commit()
        return {"h3_cells": len(counts), "poi_points": sum(counts.values())}

    @task
    def refresh_matviews():
        """Refresh the low-zoom tile views so tiles serve the fresh import."""
        refreshed = []
        with _connect() as conn, conn.cursor() as cur:
            for mv in ("mv_tiles_polygon_low", "mv_tiles_line_low", "mv_tiles_point_low"):
                exists = _one(cur, "SELECT count(*) FROM pg_matviews WHERE matviewname = %s", (mv,))
                if exists:
                    cur.execute(f"REFRESH MATERIALIZED VIEW {mv}")
                    refreshed.append(mv)
            conn.commit()
        return refreshed

    @task
    def report(source: dict, checks: dict, h3_stats: dict, refreshed: list):
        """One line a human can read; the run's numbers in the task log."""
        summary = (
            f"SiteLens ETL OK | source {source['size_mb']}MB "
            f"({'changed' if source['changed'] else 'unchanged — import skipped'}) | "
            f"points {checks['points']:,} lines {checks['lines']:,} "
            f"polygons {checks['polygons']:,} | "
            f"H3 res {H3_RESOLUTION}: {h3_stats['poi_points']:,} POIs -> "
            f"{h3_stats['h3_cells']:,} cells | matviews refreshed: "
            f"{', '.join(refreshed) or 'none present'}"
        )
        print(summary)
        return summary

    source = extract()
    gate = freshness_gate(source)
    loaded = load_osm()
    gate >> [loaded, skip_load]
    checks = validate()
    [loaded, skip_load] >> checks
    h3_stats = transform_h3(checks)
    refreshed = refresh_matviews()
    checks >> refreshed
    report(source, checks, h3_stats, refreshed)


sitelens_etl()
