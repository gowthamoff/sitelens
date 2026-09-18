# SiteLens single-origin image.
# Stage 1 builds the React SPA; Stage 2 runs the FastAPI API AND serves the
# compiled SPA from the same origin (no CORS, no separate CDN needed).
# NOTE: build context must be the REPO ROOT so both client/ and backend-py/ are visible:
#   docker build -t sitelens-api .    (run from /opt/sitelens)

# ── Stage 1: build the SPA ──
FROM node:20-slim AS web
WORKDIR /web
COPY client/package.json client/package-lock.json ./
RUN npm ci
COPY client/ ./
# Same-origin: empty base URLs => the app calls /api/* and /tiles/* on its own host.
ENV VITE_API_BASE="" VITE_TILE_BASE="" VITE_NDVI_BASE=""
RUN npm run build

# ── Stage 2: Python API + static SPA ──
FROM python:3.12-slim
WORKDIR /app
COPY backend-py/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt "uvicorn[standard]==0.34.0"
COPY backend-py/app ./app
# Drop the compiled SPA where FastAPI serves it (see app/main.py).
COPY --from=web /web/dist ./app/static
EXPOSE 8080
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8080"]
