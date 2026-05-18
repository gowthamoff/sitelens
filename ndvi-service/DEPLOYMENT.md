# NDVI Service — Deployment Guide

## How NDVI Fits Your Existing Infrastructure

```
BEFORE:                              AFTER:
┌─────┐    /api/*     ┌─────────┐   ┌─────┐    /api/*        ┌─────────┐    localhost:8000    ┌──────────┐
│ ALB │──────────────→ │ Node.js │   │ ALB │─────────────────→│ Node.js │───────────────────→ │ Python   │
│     │    /tiles/*   ┌┤         │   │     │    /tiles/*      │         │                     │ NDVI     │
│     │──────────────→││ :3000   │   │     │─────────────────→│ :3000   │                     │ :8000    │
└─────┘               │└─────────┘   └─────┘                 └─────────┘                     └──────────┘
                      │ Martin       │                          │                                │
                      │ :3001        │                          │ Martin                         │
                      └──────────────┘                          │ :3001                          │
                                                                └────────────────────────────────┘
                                                                     All on same EC2, same Docker network
```

No ALB changes needed. Node.js proxies NDVI requests to Python internally.

---

## Step 1: Create ECR Repository for NDVI Service

Run this once in PowerShell:

```powershell
aws ecr create-repository `
  --repository-name site-analysis/ndvi-service `
  --region ap-south-1
```

Note the repository URI. It'll be something like:
`123456789.dkr.ecr.ap-south-1.amazonaws.com/site-analysis/ndvi-service`

---

## Step 2: Build and Push NDVI Docker Image

```powershell
# Navigate to ndvi-service folder
cd ndvi-service

# Login to ECR
aws ecr get-login-password --region ap-south-1 | docker login --username AWS --password-stdin 123456789.dkr.ecr.ap-south-1.amazonaws.com

# Build the image
docker build -t ndvi-service .

# Tag it
docker tag ndvi-service:latest 123456789.dkr.ecr.ap-south-1.amazonaws.com/site-analysis/ndvi-service:latest

# Push to ECR
docker push 123456789.dkr.ecr.ap-south-1.amazonaws.com/site-analysis/ndvi-service:latest
```

---

## Step 3: Create the Cache Table on RDS

Connect to your RDS via DBeaver and run:

```sql
CREATE TABLE IF NOT EXISTS ndvi_cache (
  id            SERIAL PRIMARY KEY,
  geom_hash     VARCHAR(64) NOT NULL,
  request_type  VARCHAR(20) NOT NULL,
  params_hash   VARCHAR(64) NOT NULL,
  result        JSONB NOT NULL,
  computed_at   TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(geom_hash, request_type, params_hash)
);

CREATE INDEX idx_ndvi_cache_lookup
  ON ndvi_cache(geom_hash, request_type, params_hash);
```

---

## Step 4: Add NDVI Route to Node.js Backend

1. Copy `ndvi.js` to your backend's `routes/` folder

2. In your `app.js`, add:
```javascript
const ndviRoutes = require('./routes/ndvi');
app.use('/api/ndvi', ndviRoutes);
```

3. Add env var to your backend's Docker config:
```
NDVI_SERVICE_URL=http://ndvi-service:8000
```

---

## Step 5: Update docker-compose.yml on EC2

SSH into your EC2 (or use SSM) and update your docker-compose.yml
to include the ndvi-service. See the docker-compose.yml in this repo.

Key environment variables needed:
```bash
# In your .env or docker-compose environment section
ECR_REPO_BACKEND=123456789.dkr.ecr.ap-south-1.amazonaws.com/site-analysis/backend
ECR_REPO_NDVI=123456789.dkr.ecr.ap-south-1.amazonaws.com/site-analysis/ndvi-service
DATABASE_URL=postgresql://user:pass@rds-endpoint:5432/siteanalysis
```

---

## Step 6: Update deploy-backend.ps1

Add these lines to your existing deployment script:

```powershell
# ── NDVI Service Build & Push ──
Write-Host "Building NDVI service..." -ForegroundColor Cyan

docker build -t ndvi-service ./ndvi-service
docker tag ndvi-service:latest "$ECR_REPO_NDVI:latest"
docker push "$ECR_REPO_NDVI:latest"

# ── SSM: Pull and restart on EC2 ──
# Add to your existing SSM command to also restart ndvi-service:
$ssmCommand = @"
  cd /opt/app
  aws ecr get-login-password --region ap-south-1 | docker login --username AWS --password-stdin $ECR_ACCOUNT
  docker pull $ECR_REPO_BACKEND:latest
  docker pull $ECR_REPO_NDVI:latest
  docker compose down
  docker compose up -d
"@
```

---

## Step 7: Test Locally Before Deploying

Before pushing to AWS, test everything locally:

```powershell
# Terminal 1: Start NDVI service
cd ndvi-service
docker build -t ndvi-service .
docker run -p 8000:8000 ndvi-service

# Terminal 2: Test the health endpoint
curl http://localhost:8000/health
# Should return: {"status":"healthy","service":"ndvi"}

# Terminal 3: Test snapshot endpoint
curl -X POST http://localhost:8000/ndvi/snapshot `
  -H "Content-Type: application/json" `
  -d '{
    "geometry": {
      "type": "Polygon",
      "coordinates": [[[79.94,12.95],[80.00,12.95],[80.00,13.00],[79.94,13.00],[79.94,12.95]]]
    },
    "max_cloud_cover": 20
  }'
```

Expected response (after 10-30 seconds):
```json
{
  "mean_ndvi": 0.3245,
  "min_ndvi": -0.1023,
  "max_ndvi": 0.8134,
  "health_label": "Sparse Vegetation",
  "breakdown": {
    "water_or_shadow": 2.3,
    "barren_or_built": 28.1,
    "sparse_vegetation": 35.4,
    "moderate_vegetation": 24.8,
    "dense_vegetation": 9.4
  },
  "scene": {
    "scene_id": "S2B_MSIL2A_20260410...",
    "scene_date": "2026-04-10",
    "cloud_cover": 3.2,
    "platform": "Sentinel-2B"
  },
  "preview_png_base64": "iVBORw0KGgo..."
}
```

---

## Step 8: Verify on Production

After deploying:

```bash
# Check container is running
docker ps | grep ndvi

# Check logs
docker logs ndvi-service --tail 50

# Test through Node.js proxy
curl -X POST https://your-alb-url/api/ndvi/snapshot \
  -H "Content-Type: application/json" \
  -d '{"geometry":{...}}'
```

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| `ndvi-service` won't start | Check logs: `docker logs ndvi-service`. Usually a missing dependency. |
| 502 from Node.js proxy | NDVI container isn't running or name resolution failed. Check `docker network ls`. |
| "No cloud-free imagery" | Monsoon season. Increase `max_cloud_cover` to 30-40. |
| Memory errors | Polygon too large. The service rejects > 500 km². |
| Slow first request | Normal. STAC search + COG download = 10-30s. Subsequent cached = instant. |
| 403 from Planetary Computer | URL signing failed. Check `planetary_computer.sign_inplace` is in stac_client.py. |

---

## EC2 Instance Size

Your NDVI service needs more memory than Node.js. Recommended minimum:

| Current workload | Recommended EC2 |
|-----------------|-----------------|
| Dev/testing | t3.medium (4GB RAM) |
| Production (low traffic) | t3.large (8GB RAM) |
| Production (concurrent users) | m5.xlarge (16GB RAM) |

The NDVI container alone can use 1-2GB during computation. If your current
EC2 is t3.micro or t3.small, you'll need to upgrade.
