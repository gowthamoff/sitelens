# Site Analysis Platform — Feature Intelligence Document

> **Purpose:** Core reference for understanding what each feature does, how it is calculated, what data it uses, and what business problems it solves. Use this as the foundation for product decisions, feature expansion, and onboarding.

---

## Architecture Overview

Every analysis is triggered by a user drawing a polygon on the map. The platform extracts the centroid and radius of that polygon and runs all analyses in parallel against two data sources:

| Source | What it Contains | Update Frequency |
|---|---|---|
| **PostGIS (OSM)** | Buildings, roads, amenities, land use, waterways, rail | Manual import via `osm2pgsql` |
| **Google Places API (New)** | Live business ratings, hours, review counts, new locations | Real-time per request |

All spatial queries use `ST_DWithin` for radius filtering and `ST_Distance` for distance calculations on a geography type (geodesic accuracy in metres).

---

## Feature 1 — Competitor Intelligence

### What it does
Finds all businesses of the selected type (restaurant, pharmacy, grocery, clinic, hospital, education, fitness, bank, hotel, tea) within the analysis radius.

### How it is calculated

**Step 1 — OSM Query (up to 3,000 m radius)**
- Queries `planet_osm_point` for points matching the business type SQL condition.
- For each result, enriches with: nearest road type (within 60 m), and a barrier check — whether a railway, river, or motorway intersects the straight-line path between the site and the competitor.
- Returns up to 50 results ordered by distance.

**Step 2 — Google Places (parallel)**
- Calls Google Places Nearby Search with the same radius (capped at 50,000 m).
- Returns live rating, review count, open status, hours, price level.

**Step 3 — Merge & Deduplicate**
- `mergeOsmWithGoogle()` matches OSM and Google records within 30 m of each other.
- Result gets a `source` tag:
  - `osm+google` — matched, full data (Gold Standard)
  - `osm` — in mapping database only
  - `google` — live business, not yet mapped

### Output summary fields
`total_count`, `nearest_m`, `farthest_m`, `with_barrier`, `on_main_road`, `on_side_street`, `google_enriched`, `google_only_added`

### What problems it solves

| Scenario | Insight Provided |
|---|---|
| **Opening a restaurant** | Are there 12 restaurants within 500 m, or 0? What is the nearest one's Google rating? |
| **Choosing between two plots** | Plot A has 3 competitors on main road, Plot B has 8 with a railway barrier blocking 5 of them. |
| **Franchise site selection** | Count of direct-format competitors (fast_food vs. full restaurant) by sub-type. |
| **Investor due diligence** | Verify claimed "no competition" — OSM + Google double-check removes blind spots. |

---

## Feature 2 — Opportunity Gap Detection

### What it does
Identifies high-footfall anchor locations (hospitals, schools, bus stations, railway stations, cinemas, markets, stadiums, worship sites, government offices) that have **zero** businesses of the selected type within a 300 m radius. These are locations where demand likely exists but supply does not.

### How it is calculated

**Step 1 — Find footfall anchors within radius**
- Queries `planet_osm_point` for 10 anchor types within the analysis radius.
- Each anchor is a proven crowd generator.

**Step 2 — Count supply around each anchor**
- For each anchor found, counts how many businesses of the selected type exist within 300 m of that anchor (not the site — the anchor itself).

**Step 3 — Google enrichment**
- Runs the same Google Places query in parallel.
- Adds Google-found businesses to the 300 m count around each anchor.
- A gap is only confirmed as a **true gap** when BOTH OSM and Google show 0 nearby businesses.

**Step 4 — Classify**
- `gaps`: anchors with 0 nearby businesses of that type → **Diamond Pins on map**
- `underserved`: anchors with exactly 1 nearby business → secondary opportunity

### What problems it solves

| Scenario | Insight Provided |
|---|---|
| **"Is there unmet demand?"** | A hospital with 2,000 daily visitors and zero pharmacies within 300 m = confirmed gap. |
| **First-mover advantage** | Identifies locations where your business would face zero day-1 competition. |
| **Franchise territory planning** | School cluster with 0 cafes = potential captive audience with no existing option. |
| **Market saturation check** | High gap count in analysis area = healthy expansion opportunity. Low gap count = saturated. |

> **Key distinction from Competitor feature:** Competitors tells you what is *near you*. Gaps tells you what is missing *near the crowds*.

---

## Feature 3 — Head-to-Head (Competitor Context)

### What it does
When a user clicks a competitor pin, the platform runs a side-by-side contextual analysis comparing the competitor's location to the user's site — evaluating footfall anchors, road type, and physical barriers for both locations.

### How it is calculated
Two parallel SQL queries run using the same `contextSQL` template — once for the competitor's coordinates, once for the site's coordinates.

Each query collects:
- **Footfall context**: up to 5 named anchor amenities within 600 m
- **Road context**: nearest highway type within 80 m
- **Barrier context**: railways, rivers, motorways within 500 m

### What problems it solves

| Scenario | Insight Provided |
|---|---|
| **"Why is that competitor thriving?"** | Their pin is 50 m from a railway station. Yours is 600 m from anything. |
| **"Should I be worried about this competitor?"** | They are behind a river — 60% of the catchment area cannot easily reach them. |
| **Negotiation / lease decision** | Concrete evidence that Site A has superior road frontage vs. Site B. |

---

## Feature 4 — Footfall Score (0–100)

### What it does
Quantifies the commercial foot-traffic potential of a location as a single score from 0 to 100 with a letter grade (F to A+).

### How it is calculated

Nine footfall categories are scored in parallel, each with its own maximum points and distance thresholds calibrated for the Indian retail context:

| Category | Max Points | Ideal Distance | Max Distance |
|---|---|---|---|
| Transit (bus/rail stops) | 15 | 200 m | 1,000 m |
| Education (schools, colleges) | 15 | 500 m | 2,000 m |
| Retail Cluster (malls, markets) | 15 | 300 m | 1,500 m |
| Places of Worship | 10 | 300 m | 1,500 m |
| Healthcare | 10 | 500 m | 2,000 m |
| Banking & ATMs | 10 | 300 m | 1,000 m |
| Government Offices | 10 | 500 m | 2,000 m |
| Food & Drink Cluster | 10 | 200 m | 1,000 m |
| Recreation & Entertainment | 5 | 500 m | 2,000 m |

**Scoring formula per category:**
1. **Quadratic decay**: POIs within the ideal distance score full weight. Score drops quadratically to 0 at max distance.
2. **Diminishing returns**: 1st POI = 100%, 2nd = 50%, 3rd = 25%, 4th = 12.5%, 5th = 6.25%. Prevents gaming by one massive cluster.
3. Category score = (sum of top-5 weighted decays / 1.9375) × max category points.

Total score = sum of all 9 category scores (max 100).

**Grade bands**: A+ ≥85, A ≥75, B+ ≥65, B ≥55, C ≥40, D ≥25, F <25.

Each POI found becomes a heatmap point on the map. Weight is proportional to category importance and distance decay so transit stops glow brighter than a distant park.

### What problems it solves

| Scenario | Insight Provided |
|---|---|
| **Comparing two plots on the same street** | Plot A scores 72 (A), Plot B scores 41 (C) — clear winner. |
| **Retail lease negotiation** | "This site scores 80 in footfall — the rent is justified." |
| **Investor screening** | Filter a city by footfall score before physical visits. |
| **Format decision** | Low score → destination format. High score → impulse/convenience format. |

---

## Feature 5 — Proximity Summary

### What it does
Counts amenities by category within the radius and reports the nearest distance in metres for each. Simple, fast, factual — the "neighbourhood completeness" check.

### How it is calculated
Eight parallel queries on `planet_osm_point`, one per category:

| Category | OSM Tags Matched |
|---|---|
| Hospital / Clinic | amenity: hospital, clinic, doctors |
| School / Education | amenity: school, university, college, kindergarten |
| Supermarket / Shop | shop: supermarket, mall, convenience |
| Restaurant / Café | amenity: restaurant, cafe, fast_food, food_court |
| Bank / ATM | amenity: bank, atm |
| Park / Recreation | leisure: park, playground, garden |
| Pharmacy | amenity: pharmacy |
| Police / Fire | amenity: police, fire_station |

Returns `count` and `nearest_m` for each. Also runs a `nearestNeighbours` query returning up to 100 all-category POIs ordered by distance for map display.

### What problems it solves

| Scenario | Insight Provided |
|---|---|
| **Residential development** | "3 schools within 1 km, nearest at 340 m" — livability metric. |
| **Employee welfare (office site)** | Nearest pharmacy 80 m, nearest restaurant 120 m = daily convenience confirmed. |
| **Healthcare facility siting** | Count of competing clinics within radius immediately visible. |

---

## Feature 6 — Land Use & Zoning Breakdown

### What it does
Shows the percentage breakdown of land use categories (residential, commercial, industrial, forest, parks, water, etc.) within the analysis radius. Also provides building coverage statistics.

### How it is calculated

**Land use breakdown:**
- Clips each OSM polygon (`landuse`, `natural`, `leisure`) to the exact analysis circle using `ST_Intersection`.
- Calculates actual clipped area using `ST_Area` on geography type.
- Groups by category and computes percentage of total clipped area.
- Prevents double-counting: only the portion of a large forest that falls inside the circle is counted.

**Building statistics:**
- Counts all buildings (`planet_osm_polygon WHERE building IS NOT NULL`) within radius.
- Reports: building count, total footprint m², average footprint m², coverage % of the circle.

### What problems it solves

| Scenario | Insight Provided |
|---|---|
| **Commercial site selection** | "68% residential, 12% commercial" = embedded demand but low competition zone. |
| **Industrial risk screening** | High industrial% = potential air/noise quality concerns. |
| **Future development planning** | Low building coverage + residential land use = growth zone. |
| **Property valuation context** | Green coverage % is an amenity premium indicator. |

---

## Feature 7 — Connectivity Index (0–100)

### What it does
Measures how well-connected a location is by road network density, intersection count, and road type diversity.

### How it is calculated
Three parallel queries on `planet_osm_line`:

1. **Road density**: Total length (km) of all vehicle roads within radius ÷ area of circle (km²) = km/km².
2. **Intersection count**: Points where 3+ road segments share an endpoint. High count = walkable grid. Low count = dead-end suburb.
3. **Road type diversity**: Count of distinct highway types. A location served by motorway + state highway + local road + service lane scores higher than one with only residential streets.

**Index formula**: `min(100, density × 4 + intersections × 0.5 + diversity × 3)`

**Grade bands**: Excellent ≥80, Good ≥60, Fair ≥40, Poor <40.

### What problems it solves

| Scenario | Insight Provided |
|---|---|
| **Retail accessibility** | Low connectivity = fewer people can reach the site from multiple directions. |
| **Delivery business** | High road density = faster last-mile logistics. |
| **Premium rent justification** | "Connectivity Index 87 — exceptional multi-modal access." |
| **Comparing suburban vs. urban plots** | Objectively quantifies what "city centre" means vs. "outskirts". |

---

## Feature 8 — Transport & Walkability

### What it does
Breaks down road types by segment count and total length. Counts transit stops. Produces a walkability score.

### How it is calculated

**Road breakdown**: Groups all highway segments within radius by type, summing total length per type.

**Transit count**: Counts bus stops, rail/tram stops (weighted ×3), and ferry terminals.

**Walkability score**: `min(100, (total_road_km + transit_count × 5) / (radius / 200))`
Rail stops are weighted 3× because they represent higher-frequency, higher-volume transit.

### What problems it solves

| Scenario | Insight Provided |
|---|---|
| **Quick-service restaurant** | High bus stop count = strong walk-in potential during peak hours. |
| **Logistics warehouse** | Road type breakdown shows direct access to state highway or national highway. |
| **Premium residential** | Low road density + park proximity = quiet neighbourhood positioning. |

---

## Feature 9 — Environmental Scan

### What it does
Measures green space coverage (forests, parks, meadows) and water body coverage (lakes, rivers, wetlands) within the radius. Lists nearest waterways.

### How it is calculated
- Three queries: polygon water bodies, polygon green areas, linear waterways.
- Both polygon queries clip to the analysis circle using `ST_Intersection` to prevent overcount from large partially-overlapping features.
- Coverage % = clipped area / circle area × 100.

**Green types tracked**: forest, meadow, orchard, vineyard, allotments, park, garden, nature_reserve, wood, scrub, grassland, heath.

**Water types tracked**: lake, reservoir, river (polygon), wetland, and linear rivers/streams/canals.

### What problems it solves

| Scenario | Insight Provided |
|---|---|
| **Premium real estate marketing** | "32% green coverage within 1 km" — quantifiable lifestyle claim. |
| **NDVI cross-validation** | Compare OSM green% with satellite NDVI — discrepancies reveal recent construction or seasonal changes. |
| **Flood risk indicator** | High water body + waterway count near site = drainage risk flag for further investigation. |
| **Eco-tourism or wellness facility** | Confirm natural environment credentials before committing to a location. |

---

## Feature 10 — Risk Assessment

### What it does
Identifies industrial hazards (factories, landfills, quarries, wastewater plants) and evaluates emergency service accessibility near the site.

### How it is calculated

**Industrial risks**: Queries `planet_osm_polygon` for `landuse IN (industrial, quarry, landfill, construction, brownfield)` and `man_made IN (wastewater_plant, petroleum_well, chimney)`. Returns count, nearest distance, and total area per risk type.

**Power infrastructure**: Counts power-related points (poles, towers, substations) within radius.

**Emergency services**: Nearest hospital, fire station, police station, ambulance station within radius (top 5 by distance).

**Risk score formula**: `min(100, (industrial_area_m² / 10,000) × 20 + max(0, 5 − emergency_count) × 10)`
- More industrial land = higher score. More emergency services = lower score.
- **Risk level**: High ≥70, Moderate ≥40, Low <40.

### What problems it solves

| Scenario | Insight Provided |
|---|---|
| **Due diligence** | Confirms or denies presence of industrial land adjacent to proposed site. |
| **Insurance underwriting** | Distance to nearest fire station directly affects commercial property premium. |
| **Childcare / school siting** | Regulatory requirement to avoid proximity to industrial or hazardous land. |
| **Residential development** | Flags potential air quality or noise complaints before land purchase. |

---

## Feature 11 — Amenity Score (0–100)

### What it does
A single liveability/desirability score quantifying how well-served a location is across seven essential amenity categories.

### How it is calculated
Seven weighted categories, each with a cap on how many POIs contribute to the score:

| Category | Weight | Cap |
|---|---|---|
| Health | 20 | 5 |
| Education | 20 | 5 |
| Retail | 15 | 5 |
| Food & Drink | 10 | 8 |
| Finance | 10 | 3 |
| Leisure | 15 | 5 |
| Safety | 10 | 3 |

Score per category = `min(count, cap) / cap × weight`. Total = sum of all 7 (max 100).

Grade: A ≥80, B ≥60, C ≥40, D <40.

### What problems it solves

| Scenario | Insight Provided |
|---|---|
| **Single comparable score** | One number for comparing 20 candidate sites in a spreadsheet. |
| **Mixed-use development** | Identify which amenity category is under-served to decide what to build next. |
| **Employee recruitment** | "Our office site scores 78 in liveability" as an HR talking point. |
| **Franchise territory assignment** | Ensure all franchise sites meet a minimum amenity score standard. |

---

## Feature 12 — NDVI (Vegetation Index from Satellite)

### What it does
Calculates actual chlorophyll density of green cover within the drawn polygon using real Sentinel-2 satellite imagery. Confirms whether OSM-tagged "forest" is genuinely healthy and dense, or sparse/degraded.

### How it is calculated

1. **Scene search**: Queries Microsoft Planetary Computer's STAC API for Sentinel-2 L2A imagery covering the polygon within the last 90 days. Picks the scene with lowest cloud cover (<20% by default).
2. **Band download**: Downloads only Band B04 (Red) and Band B08 (Near-Infrared) pixels that fall inside the polygon using HTTP Range Requests on Cloud-Optimized GeoTIFF (COG). A 1 GB file becomes a 2 MB download.
3. **NDVI computation**: `NDVI = (NIR − Red) / (NIR + Red)`. Output: a pixel-level array from −1 to +1.
4. **Classification**: Pixels classified into 5 bands: water/shadow, barren/built, sparse vegetation, moderate vegetation, dense vegetation.
5. **Output**: Mean NDVI, min/max/std deviation, per-category breakdown (%), and a colourised PNG heatmap overlaid on the map. Cached in PostgreSQL for 7 days.

### Data source
Sentinel-2 satellite (European Space Agency) via Microsoft Planetary Computer. 10 m/pixel resolution, updated every 5 days.

### What problems it solves

| Scenario | Insight Provided |
|---|---|
| **Green buffer verification** | Confirms that the "forest" shown on OSM is alive (NDVI 0.6+) not degraded scrub (NDVI 0.2). |
| **Seasonal planning** | Compare NDVI in June (monsoon) vs. March (dry) to understand true year-round green quality. |
| **Environmental compliance** | Quantified vegetation density for regulatory reporting or LEED certification support. |
| **Premium residential marketing** | "Dense vegetation covers 61% of the site catchment" — backed by satellite data. |
| **Site clearing feasibility** | High NDVI + large area = significant vegetation removal cost before construction. |

---

## Data Flow Summary

```
User draws polygon
       │
       ▼
Client (React/Turf.js)
  Computes centroid + radius → sends to API
       │
       ▼
Node.js API
  Fires all 12 analyses in parallel
       │
  ┌────┴──────────────┐
  ▼                   ▼
PostGIS (OSM)    Google Places API
planet_osm_point     Nearby Search
planet_osm_line      (concurrent)
planet_osm_polygon
       │                   │
       └──────┬────────────┘
              ▼
        Merge / Enrich
        (Competitors + Gaps)
              │
              ▼
        Response JSON
        → Map pins, heatmap,
          scores, breakdowns
              │
     ┌────────┘
     ▼
NDVI (separate path)
  Python FastAPI → Planetary Computer
  → Sentinel-2 bands → computation
  → Cached in PostgreSQL ndvi_cache
  → PNG + stats → Map overlay
```

---

## Supported Business Types

| Key | Matches |
|---|---|
| `restaurant` | restaurant, fast_food, cafe, food_court, ice_cream, biergarten |
| `pharmacy` | pharmacy, chemist, medical_supply |
| `grocery` | supermarket, convenience, grocery, general, wholesale |
| `clinic` | clinic, doctors, dentist, veterinary |
| `hospital` | hospital |
| `education` | school, college, university, training |
| `fitness` | fitness_centre, sports_centre, sports shop |
| `bank` | bank, atm |
| `hotel` | hotel, motel, hostel, guest_house |
| `tea` | cafe, tea, tea_shop, tea/coffee shop |

---

## Expansion Principles

When adding a new feature, it must:

1. **Have a clear user question it answers** — define it in one sentence before writing code.
2. **Use the existing OSM tables** unless the data genuinely doesn't exist there.
3. **Run in parallel** — add it to the `Promise.all` in `routes/analysis.js` `/full` endpoint.
4. **Return a score or structured summary** alongside raw data for display.
5. **Document the scenario table** — at least 3 real-world use cases in this file.
