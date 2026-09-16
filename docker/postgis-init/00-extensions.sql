-- Runs once on first DB init (postgis image executes /docker-entrypoint-initdb.d).
-- The postgis image already creates the `postgis` extension; we add the rest the
-- app needs.
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS hstore;     -- required by osm2pgsql --hstore
CREATE EXTENSION IF NOT EXISTS pg_trgm;    -- geocode fuzzy search (similarity, <->, %)
CREATE EXTENSION IF NOT EXISTS pgcrypto;   -- users.id default gen_random_uuid()
