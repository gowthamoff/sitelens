# SiteLens DB setup — re-import OSM into the new account's RDS

The old account is gone, so the PostGIS data is rebuilt from a raw OSM extract with
`osm2pgsql`. Do this **once** against the new RDS before the Lambda will return data.

## 0. Prerequisites (local machine)
- `psql`, `osm2pgsql` installed.
- AWS CLI configured for the **new** account.

## 1. Create the database (CloudFormation)
```powershell
aws cloudformation deploy `
  --template-file infrastructure/rds-postgis.yaml `
  --stack-name sitelens-db `
  --parameter-overrides `
      VpcId=vpc-xxxx `
      SubnetIds=subnet-aaaa,subnet-bbbb `
      DbName=osm_tn `
      DbPassword=<STRONG_PASSWORD> `
      AdminCidr=<YOUR.IP>/32 `
  --capabilities CAPABILITY_NAMED_IAM
# Grab the endpoint:
aws cloudformation describe-stacks --stack-name sitelens-db `
  --query "Stacks[0].Outputs" --output table
```
Set a shell var for convenience:
```powershell
$DB = "postgresql://postgres:<PASSWORD>@<DbEndpoint>:5432/osm_tn?sslmode=require"
```

## 2. Enable extensions
```powershell
psql $DB -c "CREATE EXTENSION IF NOT EXISTS postgis;"
psql $DB -c "CREATE EXTENSION IF NOT EXISTS pg_trgm;"     # geocode fuzzy search
psql $DB -c "CREATE EXTENSION IF NOT EXISTS pgcrypto;"    # users.id gen_random_uuid()
```

## 3. Download an OSM extract
The app's sample queries target Chennai / Tamil Nadu (lat≈13.08, lng≈80.27). Grab the
matching Geofabrik extract (or a larger India one if you prefer):
- https://download.geofabrik.de/asia/india/southern-zone.html  → `southern-zone-latest.osm.pbf`

## 4. Load with osm2pgsql
```powershell
osm2pgsql --create --slim --hstore `
  --database "osm_tn" --host <DbEndpoint> --port 5432 --user postgres `
  --number-processes 2 `
  southern-zone-latest.osm.pbf
```
This creates `planet_osm_point`, `planet_osm_line`, `planet_osm_polygon`,
`planet_osm_roads`.

> **SRID note:** osm2pgsql defaults to storing `way` in EPSG:3857. The ported SQL
> already handles this — it casts `way::geography` and uses `ST_Transform(way,4326)`,
> and `/api/demand-mix-geo` auto-detects the SRID. If you instead load with
> `osm2pgsql -l` (latlong / 4326) everything still works. After loading, sanity-check:
> `psql $DB -c "SELECT ST_SRID(way) FROM planet_osm_point LIMIT 1;"`

## 5. Indexes + auth table
```powershell
psql $DB -f migrations/add-demand-indexes.sql   # spatial indexes used by demand-mix etc.
psql $DB -f migrations/auth-users.sql           # users table for /api/auth/*
```
(`migrations/tile-functions.sql` and `tile-mvs.sql` were for the Martin tile server —
**not needed** now: the Lambda's `/tiles` route runs ST_AsMVT against the base tables.)

## 6. Geocode table  ⚠️ action needed
`/api/v1/geocode` queries a `geocode_places` table (name, place_type, category, geom,
geog). The build script `docs/geocode_migration.sql` referenced by the route **is not
present in this repo**. Until it's recovered/recreated, geocode endpoints return
`503 "Geocode index not ready"` (handled gracefully — the rest of the app works).

To recreate it, build a table of named places from the OSM tables, e.g. a starting point:
```sql
CREATE TABLE geocode_places AS
SELECT name,
       'place'::text                AS place_type,
       COALESCE(place,'area')::text AS category,
       ST_Transform(way,4326)       AS geom,
       ST_Transform(way,4326)::geography AS geog
FROM planet_osm_point
WHERE name IS NOT NULL AND place IS NOT NULL;
CREATE INDEX ON geocode_places USING gin (name gin_trgm_ops);
CREATE INDEX ON geocode_places USING gist (geom);
CREATE INDEX ON geocode_places USING gist (geog);
```
Adjust to taste (add roads/areas, ranking categories) to match the old behaviour.

## 7. Verify
```powershell
psql $DB -c "SELECT count(*) FROM planet_osm_point;"
psql $DB -c "SELECT count(*) FROM planet_osm_polygon;"
```
Then run the Lambda locally (see README) and hit `/api/analysis/full`.
