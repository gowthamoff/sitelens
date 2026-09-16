#!/usr/bin/env bash
# Loads /data/region.osm.pbf into the local PostGIS, then applies SiteLens SQL.
# Idempotent: skips osm2pgsql if the data is already there; all SQL is re-runnable.
set -euo pipefail

PGHOST="${PGHOST:-postgis}"
PGUSER="${PGUSER:-postgres}"
PGDATABASE="${PGDATABASE:-osm_tn}"
export PGPASSWORD="${PGPASSWORD:-postgres}"
PBF="${PBF:-/data/region.osm.pbf}"

echo "==> waiting for Postgres at $PGHOST ..."
until pg_isready -h "$PGHOST" -U "$PGUSER" -d "$PGDATABASE" >/dev/null 2>&1; do
  sleep 2
done
echo "    Postgres is ready."

if [ ! -f "$PBF" ]; then
  echo "!! No OSM file at $PBF"
  echo "   Download a Geofabrik extract (e.g. southern-zone-latest.osm.pbf) and save it"
  echo "   to ./data/region.osm.pbf on the host, then re-run:  docker compose -f docker-compose.local.yml up osm-loader"
  exit 1
fi

EXISTS=$(psql -h "$PGHOST" -U "$PGUSER" -d "$PGDATABASE" -tAc "SELECT to_regclass('public.planet_osm_point')") || true
if [ "$EXISTS" = "planet_osm_point" ]; then
  echo "==> planet_osm_point already exists — skipping osm2pgsql import."
else
  echo "==> importing $PBF with osm2pgsql (EPSG:4326, hstore) ..."
  # -l  => store geometry in 4326 (lat/lng), which the analysis SQL assumes (way::geography).
  osm2pgsql --create --slim --hstore -l \
    -H "$PGHOST" -U "$PGUSER" -d "$PGDATABASE" \
    --number-processes 2 \
    "$PBF"
fi

echo "==> applying migrations ..."
psql -h "$PGHOST" -U "$PGUSER" -d "$PGDATABASE" -v ON_ERROR_STOP=1 -f /sql/add-demand-indexes.sql
psql -h "$PGHOST" -U "$PGUSER" -d "$PGDATABASE" -v ON_ERROR_STOP=1 -f /sql/geography-indexes.sql
psql -h "$PGHOST" -U "$PGUSER" -d "$PGDATABASE" -v ON_ERROR_STOP=1 -f /sql/auth-users.sql
psql -h "$PGHOST" -U "$PGUSER" -d "$PGDATABASE" -v ON_ERROR_STOP=1 -f /sql/geocode-places.sql

echo "==> done. Row counts:"
psql -h "$PGHOST" -U "$PGUSER" -d "$PGDATABASE" -c \
  "SELECT 'points' t, count(*) FROM planet_osm_point
   UNION ALL SELECT 'lines', count(*) FROM planet_osm_line
   UNION ALL SELECT 'polygons', count(*) FROM planet_osm_polygon
   UNION ALL SELECT 'geocode', count(*) FROM geocode_places;"
