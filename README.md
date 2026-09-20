# 🌍 SiteLens — Site Analysis Platform

*A geospatial location-intelligence platform for data-driven retail expansion and site selection.*

[![Live Demo](https://img.shields.io/badge/Live%20Demo-Visit%20App-6366f1?style=for-the-badge&logo=googlechrome&logoColor=white)](https://sitelens-kto5.onrender.com/)

> 🔗 **Live demo:** [sitelens-kto5.onrender.com](https://sitelens-kto5.onrender.com/) &nbsp;·&nbsp; *Hosted on a free tier — the first load may take ~30–50s to wake the server, then it's fast.*

---

## 💡 The Solution

Choosing the right location for a retail outlet, cafe, or restaurant is a multi-million dollar decision that is too often driven by gut feeling. We replace guesswork with deterministic, spatial data.

Our platform instantly ingests raw OpenStreetMap footprints, live Google Places data, and local road networks to generate hyper-local intelligence — whether you are avoiding self-cannibalization, identifying competitor blind spots, or predicting peak trading hours based on local zoning.

---

## ✨ Core Features

### 📊 Demand Mix & Peak Prediction
Calculates the exact geometric percentage of Office, Residential, Education, and Transit zones within a 500m radius of your site. Using this data, the platform algorithmically predicts peak trading windows (e.g., morning rushes vs. afternoon breaks) and identifies the core demographic profile of the area.

![Demand Mix Snapshot](./assets/demandmix.png)

### ⚔️ Competitor Intelligence & Opportunity Gaps
Merges live Google Places API data with OSM geometries to map competitors with extreme precision. 
*   **Strategic Moats**: Identifies physical barriers (major roads, railways) and footfall anchors (hospitals, colleges) that shield you from competition.
*   **Opportunity Gaps**: Automatically flags highly populated zones that lack specific amenities (e.g., a large tech park with zero cafes within 300m), highlighting immediate expansion opportunities.

![Competitor Intelligence](./assets/competitors.png)
![Opportunity Gaps](./assets/gaps.png)

### 🛡️ Cannibalization Risk Engine
Upload a CSV of your existing outlet network to instantly assess self-cannibalization risk before signing a lease. The PostGIS engine calculates the exact geometric overlap of Walk (500m) and Delivery (3km) catchments, automatically classifying the new site as Safe, Low Risk, or High Risk.

![Cannibalization Snapshot](./assets/cannibalize.png)

### 🚶 Footfall & Connectivity
Generates a proprietary Walkability and Footfall score by analyzing road segment density, public transit nodes (bus/metro stops), and surrounding civic amenities directly streamed from the spatial database.

![Footfall Snapshot](./assets/footfall.png)

---

## 🏗️ Technical Architecture

*   **Frontend**: React, TypeScript, Vite, MapLibre GL JS (interactive vector + raster maps, multiple base layers incl. Google Hybrid)
*   **Backend**: Python, FastAPI — spatial REST APIs and PostGIS-backed vector tiles (`ST_AsMVT`)
*   **Database**: PostgreSQL + PostGIS on Amazon RDS
*   **Spatial performance**: GiST / geography indexing, PostgreSQL tuning, materialized views, and H3 aggregation — queries tuned up to **~192× faster**
*   **Data pipeline**: `osm2pgsql` import of OpenStreetMap features into PostGIS (12M+ features)
*   **Deployment**: Single-origin Docker image on AWS EC2 (FastAPI serves the built React app *and* the API from one origin — no CORS), PostGIS on Amazon RDS, provisioned via AWS CloudFormation; HTTPS fronted by a lightweight reverse proxy

---

## 🚀 Quick Start (Local Development)

The full stack runs locally with Docker — no AWS account needed.

**Prerequisites:** Docker, and an OpenStreetMap extract saved as `./data/region.osm.pbf` (see [`backend-py/DB-SETUP.md`](./backend-py/DB-SETUP.md)).

```bash
# Builds PostGIS, imports the OSM data, and starts the FastAPI API + React client
docker compose -f docker-compose.local.yml up --build
```

This starts:
*   **PostGIS** database (port `5433`)
*   **osm-loader** — one-shot: imports the `.pbf` and applies spatial migrations, then exits
*   **FastAPI backend** → `http://localhost:8080`
*   **React client** → `http://localhost:5175`

See [`LOCAL-DOCKER.md`](./LOCAL-DOCKER.md) for the full walkthrough.

---

## 📚 Documentation & Guides

*   [**Local Docker Setup**](./LOCAL-DOCKER.md): Run the whole stack locally in one command.
*   [**Database Setup**](./backend-py/DB-SETUP.md): Rebuild PostGIS from a raw OpenStreetMap extract.
*   [**Infrastructure (AWS)**](./infrastructure/deploy/README.md): CloudFormation stacks for VPC, RDS, EC2, and frontend delivery.
