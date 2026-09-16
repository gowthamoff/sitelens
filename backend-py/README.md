# SiteLens backend — Python on AWS Lambda

Python port of the old `server/` Express(Node) backend, re-architected for a
free-tier AWS account: **one Lambda (FastAPI + Mangum) behind an API Gateway HTTP
API**, talking to a **public PostGIS RDS**. No EC2, ALB, ECR/Docker, Martin, or Redis.

```
client ──HTTPS──▶ API Gateway (HTTP API) ──▶ Lambda (app.main.handler)
                                                 │ psycopg pool
                                                 ▼
                                       RDS PostgreSQL + PostGIS (public, SG-locked)
```

## Layout
```
app/
  main.py        FastAPI app + exception handlers + Mangum `handler`
  config.py      env vars
  db.py          psycopg connection pool + named-param query() helper
  auth.py        PyJWT + bcrypt, require_auth dependency
  common.py      success()/error envelopes, ApiError/AuthError, validate_site_params
  util.py        gather() — concurrent queries (was Promise.all)
  routes/        auth, analysis, competitors, cannibalization, demand_mix, geocode, tiles, health
  services/      proximity, footfall, landuse, transport, amenity, environment,
                 connectivity, risk, competitor, google_places, auth_service
requirements.txt
template.yaml    AWS SAM (Lambda + HTTP API)
deploy.ps1       build + deploy wrapper (reads secrets from env vars)
DB-SETUP.md      one-time OSM re-import runbook
```

The SQL in each service is copied verbatim from the Node services; the only change is
node-postgres `$1/$2` → psycopg **named** placeholders `%(lng)s/%(lat)s/...`.

## Endpoints (paths unchanged from the Express app)
- `GET /health`
- `POST /api/auth/register`, `POST /api/auth/login`, `GET /api/auth/me`
- `GET /api/analysis/{proximity,footfall,neighbours,landuse,transport,amenity-score,environment,connectivity,risk,full}`
- `GET /api/competitors`, `/api/competitors/gaps`, `/api/competitors/context`
- `POST /api/cannibalization`
- `GET /api/demand-mix`, `GET /api/demand-mix-geo`
- `GET /api/v1/geocode`, `GET /api/v1/geocode/reverse`
- `GET /tiles/{layer}/{z}/{x}/{y}`  (layer = `tiles_point` | `tiles_line` | `tiles_polygon`)

Everything except `/health`, `/tiles/*`, and the register/login pair requires a
`Authorization: Bearer <jwt>` header.

## 1. Set up the database
See **DB-SETUP.md** (one-time `osm2pgsql` re-import into the new RDS).

## 2. Run locally
```powershell
cp env.example.json env.json    # fill in your RDS endpoint + secrets
sam build --use-container       # needs Docker (builds psycopg/bcrypt for Lambda runtime)
sam local start-api --env-vars env.json
# → http://127.0.0.1:3000
```
Smoke test:
```powershell
curl http://127.0.0.1:3000/health
# register → returns { success, user, token }
curl -X POST http://127.0.0.1:3000/api/auth/register `
  -H "Content-Type: application/json" `
  -d '{"email":"a@b.com","password":"password123"}'
# use the token:
curl "http://127.0.0.1:3000/api/analysis/full?lat=13.085&lng=80.218&radius=1000" `
  -H "Authorization: Bearer <TOKEN>"
```

## 3. Deploy
```powershell
$env:RDS_HOST="...; $env:RDS_DB="osm_tn"; $env:RDS_USER="postgres"; $env:RDS_PASS="..."
$env:JWT_SECRET=(python -c "import secrets;print(secrets.token_hex(48))")
$env:GOOGLE_PLACES_KEY="..."        # optional
./deploy.ps1 -GuidedFirst           # first time (creates samconfig + S3 bucket)
./deploy.ps1                        # subsequent deploys
```
The stack output `ApiUrl` is the HTTP API base URL.

## 4. Point the client at the new API
In the React client set both env vars to the `ApiUrl` and rebuild:
```
VITE_API_BASE=https://xxxx.execute-api.<region>.amazonaws.com/prod
VITE_TILE_BASE=https://xxxx.execute-api.<region>.amazonaws.com/prod
```
(See `client/src/config/constants.ts`. The client appends `/api/...` and
`/tiles/tiles_point/...` itself.) Deploying the client (S3+CloudFront) is out of scope
for this migration pass.

## Deliberate differences from the old stack
| Old | New | Why |
|---|---|---|
| Redis look-aside cache | dropped | ElastiCache isn't free; PostGIS calls are ~100–500 ms. Add CloudFront/API-GW caching later if needed. |
| Martin tile server | Lambda `/tiles` via ST_AsMVT | removes a container; SQL already existed as the Express fallback. |
| express-rate-limit (per-IP) | API Gateway global throttle | per-IP parity needs a REST API + usage plans or AWS WAF (cost). |
| Private RDS + VPC | public RDS + Lambda outside VPC | avoids a paid NAT Gateway and keeps Google Places reachable. Locked by SG + TLS. |
| NDVI FastAPI service | not ported | it was already commented out in `server.js`. |
