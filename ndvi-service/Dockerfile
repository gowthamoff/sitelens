# ─── NDVI Service Dockerfile ──────────────────────────────────
# Uses the same pattern as your Node.js Dockerfile:
# multi-stage build, small final image.
#
# Base image includes GDAL (the C library that rasterio needs).
# Without it, pip install rasterio fails with cryptic errors.
# ──────────────────────────────────────────────────────────────

FROM ghcr.io/osgeo/gdal:ubuntu-small-3.8.0 AS base

# Install Python and pip
RUN apt-get update && apt-get install -y \
    python3-pip \
    python3-dev \
    && rm -rf /var/lib/apt/lists/*

# Set working directory (like WORKDIR in your Node Dockerfile)
WORKDIR /app

# Copy requirements first (Docker layer caching — same idea as
# copying package.json before npm install)
COPY requirements.txt .
RUN pip3 install --no-cache-dir -r requirements.txt

# Copy application code
COPY app/ ./app/

# ── Health check ──
# ALB will hit GET /health every 30s
HEALTHCHECK --interval=30s --timeout=10s --retries=3 \
    CMD python3 -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/health')" || exit 1

# ── Run ──
# uvicorn = the "node" equivalent for Python ASGI apps
# --host 0.0.0.0 = listen on all interfaces (required inside Docker)
# --port 8000 = the port your Node.js backend will call
# --workers 2 = run 2 parallel workers (like PM2 cluster mode)
EXPOSE 8000
CMD ["python3", "-m", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "2"]
