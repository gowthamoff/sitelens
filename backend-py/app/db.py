"""
PostGIS access layer — Python port of server/config/db.js.

Uses a small psycopg3 connection pool created at module import (i.e. once per
warm Lambda container) and reused across invocations. The pool size is kept
single-digit for the same reason as the old Node pool: the free-tier db.t4g.micro
(1 vCPU, 1 GB) treats every PG connection as an OS process, so a large pool would
OOM the box. Lambda concurrency is bounded separately at the function level.

All queries use NAMED placeholders (%(lng)s, %(lat)s, ...) instead of node-postgres
$1/$2. Named params are safer here because the ported SQL reuses the same value
many times (e.g. ST_MakePoint($1,$2) appears repeatedly) — with positional %s we
would have to count and repeat each value.
"""
import json
from decimal import Decimal

from psycopg.rows import dict_row
from psycopg_pool import ConnectionPool

from . import config

_CONNINFO = (
    f"host={config.DB_HOST} port={config.DB_PORT} dbname={config.DB_NAME} "
    f"user={config.DB_USER} password={config.DB_PASS} sslmode={config.DB_SSLMODE} "
    # statement_timeout bounds a runaway spatial query; 120s suits heavy /full runs
    # (10 services x several queries) on a modest box. jit=off avoids ~1s of LLVM
    # compilation overhead per query that hurts these many small-ish PostGIS calls.
    f"connect_timeout=10 options='-c statement_timeout=120000 -c jit=off'"
)

# open=True connects lazily on first checkout; min_size keeps one warm connection
# alive between invocations. max_size caps concurrency within a single container.
pool = ConnectionPool(
    conninfo=_CONNINFO,
    min_size=1,
    max_size=5,
    max_idle=30.0,
    kwargs={"row_factory": dict_row},
    open=True,
)


def query(sql, params=None):
    """Run a query and return a list of dict rows (empty list for no result set)."""
    with pool.connection() as conn:
        with conn.cursor() as cur:
            cur.execute(sql, params or {})
            if cur.description is None:
                return []
            return cur.fetchall()


def query_one(sql, params=None):
    """Return the first row as a dict, or None."""
    rows = query(sql, params)
    return rows[0] if rows else None


# ── numeric / json coercion helpers ───────────────────────────────────────────
# psycopg returns SQL numeric/decimal as Decimal and ST_AsGeoJSON(text) as str.
# The original JS did parseFloat/parseInt/Number and JSON.parse; these mirror that
# so downstream arithmetic and JSON serialization behave identically.

def num(v, default=0):
    """Coerce a DB value to float (handles Decimal/str/None), like Number(v)||0."""
    if v is None:
        return default
    try:
        return float(v)
    except (TypeError, ValueError):
        return default


def to_int(v, default=0):
    if v is None:
        return default
    try:
        return int(float(v))
    except (TypeError, ValueError):
        return default


def parse_geojson(v):
    """ST_AsGeoJSON returns text → dict. If psycopg already parsed it, pass through."""
    if v is None:
        return None
    if isinstance(v, (dict, list)):
        return v
    return json.loads(v)


def jsonify(obj):
    """Recursively convert Decimal → float so Starlette's json.dumps can serialize."""
    if isinstance(obj, Decimal):
        return float(obj)
    if isinstance(obj, dict):
        return {k: jsonify(v) for k, v in obj.items()}
    if isinstance(obj, (list, tuple)):
        return [jsonify(v) for v in obj]
    return obj
