# SiteLens Geocoding: Implementation Plan & Technical Deep Dive

This document outlines the end-to-end architecture of the geocoding feature in SiteLens, covering the transition from raw OSM data to a high-performance fuzzy search interface.

## 1. Architecture Overview
The system uses a **PostGIS-backed** geocoding engine that combines text similarity (fuzzy matching) with spatial indexing.

- **Data Source:** OpenStreetMap (OSM) tables (`planet_osm_point`, `line`, `polygon`).
- **Storage:** Materialized View (`geocode_places`) for unified indexing.
- **Backend:** Node.js/Express with `pg` and `express-rate-limit`.
- **Frontend:** React with `maplibre-gl` and `lucide-react`.

---

## 2. Database Implementation

### Data Consolidation
Instead of querying multiple OSM tables on the fly, we use a **Materialized View** to flatten the data:
- **POI:** Named points (shops, hospitals).
- **Area:** Neighborhoods, admin boundaries, landuse.
- **Road:** Named highways and streets.

### Search Mechanism
We use **Trigrams (`pg_trgm`)** for fuzzy matching. This allows the system to find "Anna Nagar" even if the user types "Ana Nagar".

### Performance Optimization (The "100ms Fix")
Initial testing showed high execution costs (~134ms) due to Random I/O and GIN index limitations.
- **Problem:** GIN indexes find all matches but don't support sorting. This forced the DB to scan 19k candidates and sort them in memory.
- **Solution:**
    1. **GiST Index:** Switched to GiST for the name index to support the `<->` (nearest neighbor) distance operator.
    2. **Clustering:** Used `CLUSTER geocode_places USING idx_geocode_name_gist`. This physically reorders data on the disk so similar names are stored together, turning slow random disk reads into fast sequential reads.
    3. **Subquery Ranking:** Limited the complex "Area Boost" logic to only the top 100 most similar results found by the index.

---

## 3. Backend Logic

### Forward Geocoding (`GET /api/v1/geocode`)
- **Ranking Logic:** We apply a weighted boost to prioritize larger areas over individual POIs:
  - **Areas:** 3.0x boost
  - **Roads:** 2.0x boost
  - **POIs:** 1.0x boost
- **Rate Limiting:** Restricted to 60 requests/min to protect the database from search spam.

### Reverse Geocoding (`GET /api/v1/geocode/reverse`)
Uses the `<->` spatial operator on the `geography` type to find the single closest named feature in constant time.

---

## 4. Frontend Integration

### The Search UI (`GeoSearch.tsx`)
- **Glassmorphism:** Styled to match the "modern luxury" theme of the map tools.
- **UX Features:**
  - **Debouncing:** 300ms delay to prevent API hammering while typing.
  - **Categorized Icons:** Visual distinction between areas, roads, and points.
  - **Map Sync:** Selecting a result triggers a smooth `flyTo` animation to the target coordinates at zoom level 15.

---

## 5. Key Learnings & Best Practices

> [!IMPORTANT]
> **Index Choice Matters:** Use `GIN` for exact "contains" matching in large text bodies, but use `GiST` for search bars where "top-N similarity" and "nearest neighbor" sorting are required.

> [!TIP]
> **Disk Locality:** On PostGIS databases with millions of rows, `CLUSTER` is your best friend. It minimizes the distance the disk head has to travel when fetching related search results.

> [!NOTE]
> **Early Filtering:** Always use a subquery to let the index do the "coarse filtering" (Top 100) before applying expensive business logic (like the category-based weightings) in the outer query.
