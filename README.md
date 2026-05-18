# 🌍 Site Analysis Platform: Architectural & Data Guide

Welcome to the **Site Analysis Platform**—a high-performance, professional-grade geospatial dashboard designed for real estate, urban planning, and commercial site selection. 

This document serves as the master guide explaining the data foundation, spatial processing mechanisms, interactive dashboard functionality, and cloud infrastructure.

---

## 1. Data Foundation: Hybrid Geospatial Intelligence

Our platform utilizes a hybrid data approach, merging open-source spatial data with real-time commercial APIs and satellite imagery to provide unparalleled accuracy.

### 1.1 Core Databases & APIs
*   **OpenStreetMap (OSM) & PostGIS**: The spatial backbone. Imported via `osm2pgsql`, providing highly accurate building footprints, land use polygons, and road networks.
*   **Google Places API**: Integrated for real-time commercial data. We fetch live ratings, review counts, open/close status, and new business locations that haven't yet been mapped by the open-source community.
*   **Satellite Imagery (NDVI)**: Integration of high-resolution satellite services to calculate the Normalized Difference Vegetation Index (NDVI) for environmental analysis via our dedicated Python service.

### 1.2 The Processing Engine
1. **Parallel Enrichment:** When a user analyzes a site, the backend fires parallel queries to both the PostGIS database and the Google Places API. 
2. **Deduplication:** The platform intelligently merges the sources. It utilizes the exact physical geometries from OSM and enriches them with the live business data from Google.
3. **Vector Tile Rendering:** High-performance map visualization is powered by the **Martin Tile Server**, which streams PBF vector tiles directly from PostGIS to the frontend, allowing for seamless client-side styling.
4. **Spatial Translation:** The client handles geometry validation via `turf.js`, sending GeoJSON metadata to the REST API.

---

## 2. Dashboard Functionality: Interactive Analysis

The platform provides multi-dimensional insights across specialized, highly interactive tabs:

### 🎯 Competitor Intelligence & Opportunity Gaps
*   **Source-Aware Mapping**: Competitors are visualized on the map using custom SVG pins based on data quality:
    *   🟢 **Enriched (Google+OSM)**: The "Gold Standard". Geometrically precise with live ratings.
    *   🔵 **Google Only**: Found via API but lacks exact OSM building footprint.
    *   🟠 **OSM Only**: Found in local spatial data but lacks live Google context.
*   **Opportunity Gaps**: The engine actively detects high-footfall "gaps" (e.g., a large school or hospital with 0 cafes within 300m). These are mapped using distinct ❇️ **Diamond Pins**.
*   **Bidirectional Sync**: Clicking a pin on the map instantly opens a rich dark-glass popup and automatically scrolls the sidebar panel to the corresponding head-to-head comparison row.

### 🌱 Environmental & NDVI Analysis
*   **NDVI Assessment**: Utilizing satellite imagery to analyze chlorophyll density and assess the true health of green cover around a site.
*   **Land Use Zoning**: Premium doughnut charts showing the exact percentage breakdown of zoning areas (Residential, Commercial, Forest, etc.).

### 🚶 Footfall & Transport
*   **Footfall Heatmaps**: Visualizes estimated pedestrian traffic density using localized infrastructure indicators (transit stops, road density).
*   **Connectivity Index**: A proprietary 0-100 score evaluating road networks, intersection counts, and transport accessibility.

---

## 3. Quick Start Setup Guide (Local Development)

We use a **Single Source of Truth** environment architecture combined with `docker-compose` to make local development painless.

### Prerequisites
* Docker and Docker Compose installed.
* A PostgreSQL instance (local or remote) populated with OSM spatial data.
* A Google Places API Key (Optional, but highly recommended for full features).

### Step 1: Configure Environment Variables
1. **Server**: Copy `server/.env.example` to `server/.env`. Fill in your Database connection string and your `GOOGLE_PLACES_KEY`.
2. **Client**: Copy `client/.env.example` to `client/.env.development`.

> [!WARNING]
> **Google Places API Key**: The platform will gracefully degrade if the key is missing, falling back to OSM-only data. However, for full commercial enrichment, an active Google Places API (New) key is required.

### Step 2: Spin Up the Infrastructure
Run the following from the root of the repository:
```bash
docker-compose up -d
```
This single command builds and starts:
* The **Node.js REST API** on port `8080`.
* The **Python NDVI Service** on port `8000`.
* The **Martin Vector Tile Server** on port `3000`.

### Step 3: Start the Frontend
```bash
cd client
npm install
npm run dev
```

---

## 4. Current Infrastructure & Scalability

The platform is fully cloud-native, deployed on **AWS** with a focus on low-latency, security, and reliability.

### 4.1 Architecture Overview
*   **Compute:** Dockerized Node.js REST API and the Python NDVI service running on EC2 within an **Auto Scaling Group**.
*   **Load Balancing:** **Application Load Balancer (ALB)** provides intelligent routing.
*   **Database:** **Amazon RDS (PostgreSQL 15 + PostGIS)** running in a private subnet for maximum security.
*   **Security Vault:** Environment variables (like `RDS_PASS` and `GOOGLE_PLACES_KEY`) are managed strictly on the local machine and injected dynamically into container RAM during deployment via AWS SSM. Secrets are *never* committed or stored on disk in the cloud.

### 4.2 Automation & CI/CD
*   **One-Click Deployment:** The `npm run deploy:backend` and `npm run deploy:ndvi` commands automate the full pipeline:
    1.  Securely reads local `.env` variables.
    2.  Builds and pushes Docker images to **Amazon ECR**.
    3.  Uses **AWS Systems Manager (SSM)** to trigger zero-downtime container rotations on production instances.

---

## 5. Operational Links & Guides

*   [**Infrastructure Setup**](./infrastructure/): Modular CFN templates for VPC, RDS, and Backend.
*   [**Database Migration**](./doc/db-migration.md): Guide for moving PostGIS data to AWS RDS.
*   [**Operational Guide**](./doc/operational-guide.md): Connection guides for DBeaver, SSL, and SSM recovery.
*   [**Deployment Scripts**](./scripts/): Automated CI/CD powershell scripts.

---

## 🚀 Future Roadmap: Global Expansion

1. **Global CDN Interfacing:** Deploying **Amazon CloudFront** in front of the Martin tile server to edge-cache map tiles globally.
2. **Geo-Sharding:** Transitioning to **Amazon Aurora** for planet-scale data sharding across multiple AWS regions.
3. **Real-time Traffic Analysis:** Integrating live road network data into the Connectivity Index.

---
*Distributed under the MIT License. See `LICENSE` for more information.*
