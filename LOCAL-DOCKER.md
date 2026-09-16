# Run SiteLens 100% locally in Docker (no AWS, no billing)

Self-contained stack: **PostGIS + Python backend + React client**, with a one-shot
**osm2pgsql** loader. Everything runs on your laptop.

```
 ┌────────────┐   ┌──────────────┐   ┌──────────────┐   ┌────────────┐
 │  client    │──▶│  backend     │──▶│  postgis     │◀──│ osm-loader │
 │  :5173     │   │  :8080       │   │  :5432       │   │ (one-shot) │
 │  (Vite)    │   │  (FastAPI)   │   │  (PostGIS16) │   │  osm2pgsql │
 └────────────┘   └──────────────┘   └──────────────┘   └────────────┘
```

## Prerequisites
- **Docker Desktop** running.
- ~3–6 GB free disk (DB + OSM extract).

## Steps

**1. Get the OSM data** (see `data/README.md`)
Download a Geofabrik `.osm.pbf` and save it as **`./data/region.osm.pbf`**.
(Chennai/TN sample: `asia/india/southern-zone-latest.osm.pbf`.)

**2. Start everything**
```powershell
docker compose -f docker-compose.local.yml up --build
```
First run order:
- `postgis` starts → becomes healthy
- `osm-loader` imports the `.pbf` (this is the slow step — minutes, depends on extract size) then applies indexes + `users` + `geocode_places`, then **exits**
- `backend` serves the API on **http://localhost:8080**
- `client` serves the map on **http://localhost:5173**

> The backend may log DB errors until the loader finishes — that's expected; it
> recovers once the tables exist.

**3. Use it**
- App: **http://localhost:5173**
- API health: http://localhost:8080/health
- Register, then call analysis:
```powershell
curl -X POST http://localhost:8080/api/auth/register `
  -H "Content-Type: application/json" `
  -d '{"email":"a@b.com","password":"password123"}'

curl "http://localhost:8080/api/analysis/full?lat=13.085&lng=80.218&radius=1000" `
  -H "Authorization: Bearer <TOKEN_FROM_REGISTER>"
```
- A tile: http://localhost:8080/tiles/tiles_point/13/5894/3963 (returns protobuf bytes)

## Everyday commands
```powershell
docker compose -f docker-compose.local.yml up -d         # start in background
docker compose -f docker-compose.local.yml logs -f backend
docker compose -f docker-compose.local.yml down          # stop (keeps the DB volume)
docker compose -f docker-compose.local.yml down -v       # stop + WIPE the database
docker compose -f docker-compose.local.yml up osm-loader # re-run the import only
```

## Notes
- **Data persists** in the `pgdata` Docker volume between restarts. Re-importing is
  skipped automatically if `planet_osm_point` already exists (delete the volume with
  `down -v` to force a fresh import).
- **Google Places** enrichment is off unless you set `GOOGLE_PLACES_KEY` in
  `docker-compose.local.yml` (backend service). Everything else works without it.
- **Client env**: if the map doesn't hit the API, create `client/.env.local` with
  `VITE_API_BASE=http://localhost:8080` and `VITE_TILE_BASE=http://localhost:8080`,
  then restart the `client` service.
- This is independent of the AWS path — the same `backend-py` code deploys to Lambda
  later via `backend-py/template.yaml` when you want a public URL.
```
