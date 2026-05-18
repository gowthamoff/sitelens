# NDVI Developer Reference
### For a JS developer who wants to understand and extend this feature

---

## 1. What is NDVI? (Plain English)

NDVI stands for **Normalized Difference Vegetation Index**.

It's a **number from -1 to +1** that tells you how much living green vegetation is in a satellite photo.

```
NDVI = (NIR - Red) / (NIR + Red)
```

- **NIR** = Near-Infrared light (plants reflect a LOT of this — invisible to humans)
- **Red** = Red light (plants absorb most of this for photosynthesis)

| NDVI Value | What it means |
|-----------|---------------|
| Below 0 | Water, shadow, bare rock |
| 0 – 0.2 | Barren land, concrete, buildings |
| 0.2 – 0.4 | Sparse grass, shrubs |
| 0.4 – 0.6 | Moderate vegetation, farms |
| 0.6 – 1.0 | Dense forest, healthy crops |

**Why does this work?** Healthy plants reflect infrared but absorb red. Buildings do the opposite. The math amplifies this difference into a clean -1 to +1 score.

---

## 2. Where the Satellite Data Comes From

### Microsoft Planetary Computer
A free public cloud service that stores petabytes of satellite imagery. We use it as our data source via a **STAC API** (a standard way to search satellite data).

### Sentinel-2 Satellite
The satellite we query. Operated by the European Space Agency. It orbits Earth every 5 days, takes photos at ~10 meter resolution. It captures both visible light AND near-infrared.

### STAC (SpatioTemporal Asset Catalog)
Think of it as a **search engine for satellite images**. You send it a polygon + date range → it returns a list of satellite images that cover that area.

### COG (Cloud-Optimized GeoTIFF)
A clever image format where you can download **only the pixels you need** instead of the full global image. 

**The Magic:** Imagine a 1GB satellite image. Without COG, you'd have to download all 1GB just to look at one house. With COG, the Python service sends an **HTTP Range Request** (e.g., "give me bytes 50,000 to 52,000") to grab exactly the pixels for your polygon and nothing else. This turns a 1GB download into a 2MB download.

---

## 3. The Full Request Flow (Step by Step)

```
User draws polygon on map
         │
         ▼
React NdviTab.tsx
  → calls runNdviAnalysis()
         │
         ▼                           (local dev)
AnalysisContext.tsx ─────────────▶  localhost:8000/ndvi/snapshot
                                     (Python FastAPI, direct)
         │
         │                           (production)
         └──────────────────────▶  /api/ndvi/snapshot  (Node.js proxy)
                                            │
                                    Check ndvi_cache table
                                    in PostgreSQL (RDS)
                                            │
                                    ┌─── HIT ──────────────────────┐
                                    │   Return cached JSON          │
                                    │   cached: true, instant ⚡   │
                                    └──────────────────────────────┘
                                            │
                                        MISS ↓
                                    Python FastAPI :8000
                                    /ndvi/snapshot
                                            │
                                    stac_client.py
                                    → Search Planetary Computer
                                    → Pick least-cloudy Sentinel-2 scene
                                            │
                                    ndvi.py
                                    → Download Red (B04) + NIR (B08) bands
                                    → Compute (NIR-Red)/(NIR+Red)
                                    → Classify pixels
                                    → Generate colourised PNG
                                            │
                                    Return JSON + base64 PNG
                                            │
                                    Node.js caches in PostgreSQL
                                            │
                                    React renders:
                                    • Stats panel
                                    • PNG overlaid on MapLibre map
```

---

## 4. The Python Files — What Each One Does

You don't need to write Python. But you need to know what to touch when adding features.

### `ndvi-service/app/main.py`
**Role:** The router. Like `server.js` in Express — defines endpoints and wires things together.

```python
@app.post("/ndvi/snapshot")     # ← This is like router.post('/snapshot')
async def ndvi_snapshot(req):
    scene = get_best_scene(...)  # Find satellite image
    return build_snapshot_response(scene, req.geometry)  # Compute + respond
```

**When to edit:** When adding a new endpoint (e.g., `/ndvi/compare` to compare two dates).

---

### `ndvi-service/app/stac_client.py`
**Role:** The data fetcher. Talks to Microsoft Planetary Computer to find satellite images.

```python
# The important functions:
get_best_scene()         # → finds 1 best image for a date
search_monthly_scenes()  # → finds 1 best image per month (for timeseries)
```

**When to edit:** If you want to change how images are selected. For example:
- Change the satellite from Sentinel-2 to Landsat
- Widen/narrow the date search window
- Filter by a different property

---

### `ndvi-service/app/ndvi.py`
**Role:** The math engine. Does the actual NIR/Red calculation, classification, and image generation.

```python
# The important functions:
compute_ndvi_from_item()    # Downloads bands, computes NDVI arrays
classify_pixels()           # Counts % of each land category
generate_preview_png_fast() # Turns NDVI array into a colourised PNG
build_snapshot_response()   # Full pipeline: STAC → NDVI → stats → PNG → response
```

**When to edit:** If you want to:
- Change the colour scale of the map overlay
- Add a new classification category
- Change the resolution (~10m per pixel currently)

---

### `ndvi-service/app/models.py`
**Role:** The data contracts. Like TypeScript interfaces but for Python. Validates incoming requests and defines response shapes.

```python
class NDVISnapshotRequest:   # What the frontend sends
class NDVISnapshotResponse:  # What we send back
class VegetationBreakdown:   # The 5 land categories
```

**When to edit:** When adding a new field to the request or response. Always update the matching TypeScript interface in `client/src/types/analysis.ts` too.

---

### `ndvi-service/requirements.txt`
**Role:** Like `package.json` for Python. Lists all dependencies.

```
dask==2023.12.1        ← PINNED! Don't upgrade (breaks odc-stac)
odc-stac==0.3.10       ← The satellite data loader
pystac-client==0.8.0   ← The STAC search client
planetary-computer     ← Microsoft's URL signer
fastapi                ← The web framework (like Express)
uvicorn                ← The server runner (like node server.js)
```

> **Key rule:** If you need to add a Python package, put it in `requirements.txt` and rebuild the Docker image. Never upgrade `dask` — it will break.

---

## 5. The Node.js Files — What Each One Does

### `server/routes/ndvi.js`
**Role:** The proxy + cache layer. Sits between the React frontend and the Python service.

```
Frontend → Node.js /api/ndvi/snapshot → Cache check → Python /ndvi/snapshot
```

Two key helper functions:
- `hashGeometry(geometry)` — converts a polygon to a short hash string (same polygon = same hash)
- `hashParams(params)` — hashes the date/cloud config

These two hashes together form the **cache key**. If both match a row in `ndvi_cache`, we return it instantly without touching Python.

**When to edit:**
- Change cache TTL (currently 7 days, see `CACHE_TTL_DAYS`)
- Add a new NDVI endpoint (copy the snapshot route pattern)

---

### `server/config/db.js`
**Role:** Automatically creates the `ndvi_cache` table when the server starts. You don't need to run SQL manually.

---

### `server/config/env.js`
**Role:** Exports `NDVI_SERVICE_URL`. In Docker this is `http://ndvi-service:8000`. Locally it's `http://localhost:8000`.

---

## 6. The React Files

### `client/src/context/AnalysisContext.tsx`
Where the `runNdviAnalysis()` function lives. It decides which URL to call:

| Environment | URL used | Who handles it |
|-------------|----------|----------------|
| Local dev | `localhost:8000/ndvi/snapshot` | Python FastAPI directly |
| Production | `ALB-url/api/ndvi/snapshot` | Node.js → Python proxy |

### `client/src/features/analysis/tabs/NdviTab.tsx`
The entire NDVI UI panel. If you want to change how results look, this is the only file to edit.

### `client/src/components/map/MapContainer.tsx`
Contains the map overlay logic. When `ndviData` arrives, it places the PNG over the drawn polygon using MapLibre `ImageSource`.

### `client/src/types/analysis.ts`
TypeScript interfaces. Always keep these in sync with `models.py`.

---

## 7. The Data You Get Back

```json
{
  "mean_ndvi": 0.32,           // Average greenness (-1 to 1)
  "min_ndvi": -0.10,           // Least green pixel
  "max_ndvi": 0.81,            // Most green pixel
  "std_ndvi": 0.18,            // How varied the greenness is
  "health_label": "Sparse Vegetation",

  "breakdown": {
    "water_or_shadow": 2.3,    // % of pixels
    "barren_or_built": 28.1,
    "sparse_vegetation": 35.4,
    "moderate_vegetation": 24.8,
    "dense_vegetation": 9.4
  },

  "scene": {
    "scene_id": "S2B_MSIL2A_...",
    "scene_date": "2026-04-10",  // Which image was used
    "cloud_cover": 3.2,          // How cloudy that image was (lower = better)
    "platform": "Sentinel-2B"
  },

  "preview_png_base64": "iVBORw0KGgo...",  // The colourised map overlay
  "cached": false                           // true = came from cache
}
```

---

## 8. The Cache System (How It Works)

The `ndvi_cache` table in PostgreSQL stores results so the same polygon isn't re-computed.

**Cache key = polygon hash + params hash**

```
Same polygon + same date = cache hit → instant response
Same polygon + different date = cache miss → call Python
```

Cache expires after **7 days** (`CACHE_TTL_DAYS` in `routes/ndvi.js`).

**The SQL table looks like this:**
```sql
CREATE TABLE ndvi_cache (
  geom_hash    VARCHAR(64),  -- hash of the polygon coordinates
  request_type VARCHAR(20),  -- 'snapshot' or 'timeseries'
  params_hash  VARCHAR(64),  -- hash of date + cloud cover config
  result       JSONB,        -- the full API response stored as JSON
  computed_at  TIMESTAMPTZ   -- when it was cached (for TTL check)
);
```

---

## 9. How to Add a New Feature (The Pattern)

Say you want to add a **NDWI (water index)** or **EVI (enhanced vegetation)**.

### Step 1 — Add the math in Python
In `ndvi-service/app/ndvi.py`, add a new computation function.

### Step 2 — Add the endpoint in Python
In `ndvi-service/app/main.py`, add `@app.post("/ndwi/snapshot")`.

### Step 3 — Add the model in Python
In `ndvi-service/app/models.py`, add the request/response Pydantic classes.

### Step 4 — Add the proxy in Node.js
In `server/routes/ndvi.js`, copy the snapshot route pattern and change the path.

### Step 5 — Mount the new route (if it's a new router)
In `server/server.js`, add `app.use('/api/ndwi', ndwiRouter)`.

### Step 6 — Add TypeScript types
In `client/src/types/analysis.ts`, add your new interfaces.

### Step 7 — Add state to context
In `AnalysisContext.tsx`, add state + fetch function following the `ndviData / ndviLoading / ndviError` pattern.

### Step 8 — Build the UI tab
Create a new `NdwiTab.tsx` following the `NdviTab.tsx` pattern.

### Step 9 — Register in AnalysisPanel
Add to the `TABS` array and `switch` statement.

### Step 10 — Rebuild + redeploy
```powershell
docker build -t ndvi-service ./ndvi-service  # Pick up Python changes
npm run deploy:ndvi                           # Push to ECR + SSM deploy
npm run deploy:backend                        # Push Node.js changes
```

---

## 10. Common Questions

**Q: Why Python for NDVI? Why not just JavaScript?**
A: The satellite processing libraries (`rioxarray`, `odc-stac`, `numpy`) are only available in Python. The JS ecosystem has no equivalent for COG (Cloud-Optimized GeoTIFF) reading and satellite band math.

**Q: Why not call Python from the frontend directly in production?**
A: Three reasons — (1) caching: Node.js stores results in PostgreSQL so the same polygon never runs twice. (2) security: Node.js can add auth middleware. (3) clean API: the frontend only talks to one server.

**Q: How slow is the first request?**
A: 10–30 seconds. This is network time to download satellite bands from Microsoft. Cached requests return in under 100ms.

**Q: What happens during monsoon season (heavy cloud cover)?**
A: The service returns a 404 with a message like "No cloud-free imagery found". You can increase `max_cloud_cover` from 20 to 30-40 in `AnalysisContext.tsx` to tolerate more clouds.

**Q: What is FastAPI? Is it like Express?**
A: Yes, exactly. FastAPI is to Python what Express is to Node.js. `@app.post("/ndvi/snapshot")` is identical in concept to `router.post('/snapshot')`.

**Q: What is uvicorn?**
A: uvicorn is to FastAPI what `node server.js` is to Express. It's the process that listens on port 8000.

**Q: What is Pydantic?**
A: Pydantic is to Python what Zod or TypeScript interfaces are to JS. It validates incoming JSON and defines data shapes. `models.py` is all Pydantic.

---

## 11. The Dependency Chain (Know Before Upgrading)

```
odc-stac==0.3.10
  └─ requires dask.base.quote
       └─ REMOVED in dask >= 2024.3.0
            └─ So: dask must stay at 2023.12.1
```

**Rule:** Never run `pip install --upgrade` inside the container without testing. Always pin versions in `requirements.txt`.

---

## 12. Key Commands Reference

```powershell
# Local dev — run Python service
docker run -p 8000:8000 ndvi-service

# Test Python health
curl http://localhost:8000/health

# Test NDVI directly (bypass Node.js)
curl -X POST http://localhost:8000/ndvi/snapshot `
  -H "Content-Type: application/json" `
  -d '{"geometry":{"type":"Polygon","coordinates":[[[80.0,13.0],[80.1,13.0],[80.1,13.1],[80.0,13.1],[80.0,13.0]]]}}'

# Rebuild after Python changes
docker build -t ndvi-service ./ndvi-service

# Open DBeaver tunnel
cd server && npm run db:tunnel

# Deploy Node.js backend
npm run deploy:backend

# Deploy NDVI Python service
npm run deploy:ndvi
```

---

## 13. Deep Dive: The `load()` Magic
The most important line in your Python code is in `ndvi-service/app/ndvi.py`:

```python
data = load(
    [stac_item],
    bands=["B04", "B08"],    # <-- 1. Download ONLY these two bands (Red & NIR)
    geopolygon=aoi,          # <-- 2. Download ONLY pixels inside your polygon
    chunks={},               # <-- 3. Use lazy loading (don't fetch more than needed)
)
```

This single command handles the entire networking process of jumping into a massive 1GB file in the cloud and snatching only the pixels that land inside your drawn shape.

---

## 14. The Network Chat (Behind the Scenes)
When you click "Analyse", this is the conversation happening on the wire:

1. **Search (REST API):**
   - *Python to Microsoft:* "Which Sentinel-2 photos cover this polygon from the last 90 days?"
   - *Microsoft to Python:* "Here is a list. This one (ID: S2B_...) is 98% cloud-free."

2. **Download (HTTP Range Requests):**
   - *Python to Microsoft:* "I'm opening your 1GB file for Band B04. But only give me `bytes=500000-550000` (the pixels for my polygon)."
   - *Microsoft to Python:* "Here are those specific bytes." (Repeat for Band B08).

3. **Compute:**
   - Python does the math `(NIR-Red)/(NIR+Red)` locally on those small chunks of pixels.

---

## 15. The Result: Data + Image in One
When Python finishes, it sends back **one JSON package**. It contains both the numbers (data) and the visual overlay (image).

**The JSON Structure:**
- **Stats:** `mean_ndvi`, `breakdown %`, etc. (used for your dashboard charts).
- **Image:** `preview_png_base64` — This is a complete PNG heatmap converted into a long text string.

**How React Uses It:**
Your `MapContainer.tsx` takes that long text string and tells the map: *"Take this text, turn it back into an image, and stick it on the map exactly over the polygon."* This is why you see a colorized heatmap perfectly aligned with your drawing.
