"""
FastAPI application + Lambda handler (Mangum).

This is the single Lambda behind the API Gateway HTTP API. It reproduces the
Express app's routes, auth, validation and response envelopes. The old
cross-cutting concerns map as follows:
  - helmet / compression      → handled by API Gateway / CloudFront (not here)
  - cors                      → CORSMiddleware below
  - express-rate-limit        → API Gateway stage throttling (see template.yaml)
  - redis look-aside cache    → dropped (optional CDN caching instead)
  - global errorHandler       → exception handlers below
"""
import json
import uuid
from datetime import date, datetime
from decimal import Decimal

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from mangum import Mangum

from . import config
from .common import ApiError, AuthError, error_body
from .routes import (
    analysis, auth, cannibalization, competitors, demand_mix, geocode, h3, health, tiles,
)


def _json_default(o):
    if isinstance(o, Decimal):
        return float(o)
    if isinstance(o, (datetime, date)):
        return o.isoformat()
    if isinstance(o, uuid.UUID):
        return str(o)
    if isinstance(o, (bytes, bytearray, memoryview)):
        return bytes(o).decode("utf-8", "replace")
    raise TypeError(f"Object of type {type(o).__name__} is not JSON serializable")


class SafeJSONResponse(JSONResponse):
    """Default response class that tolerates Decimal/datetime from PostGIS."""
    def render(self, content) -> bytes:
        return json.dumps(content, ensure_ascii=False, allow_nan=False, default=_json_default).encode("utf-8")


app = FastAPI(title="SiteLens API (Python/Lambda)", default_response_class=SafeJSONResponse)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"] if config.ALLOWED_ORIGIN == "*" else [config.ALLOWED_ORIGIN],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Exception handlers (port of middleware/errorHandler.js + middleware/auth.js) ──
@app.exception_handler(AuthError)
async def _auth_error(request: Request, exc: AuthError):
    return JSONResponse(status_code=exc.status, content={"success": False, "error": exc.message})


@app.exception_handler(ApiError)
async def _api_error(request: Request, exc: ApiError):
    return SafeJSONResponse(status_code=exc.status, content=error_body(exc.message, exc.status, exc.hint))


@app.exception_handler(Exception)
async def _unhandled(request: Request, exc: Exception):
    print(f"[Analysis Error] {type(exc).__name__}: {exc} path={request.url.path}")
    return SafeJSONResponse(
        status_code=500,
        content=error_body(
            str(exc) or "Internal server error occurred during spatial analysis",
            500,
            "Check DB connectivity and spatial parameters",
        ),
    )


# ── Routers ──
app.include_router(health.router)
app.include_router(auth.router)
app.include_router(analysis.router)
app.include_router(competitors.router)
app.include_router(cannibalization.router)
app.include_router(demand_mix.router)
app.include_router(geocode.router)
app.include_router(h3.router)
app.include_router(tiles.router)


# ── Serve the compiled React SPA from the same origin (single-origin EC2 deploy) ──
# The Docker build drops the Vite `dist/` output into app/static. When present,
# mount hashed assets and add a catch-all that returns index.html for client-side
# routes. API routers (/api/*, /tiles/*, /health) are registered above and match
# first, so this only catches genuine front-end paths.
import os
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

_STATIC_DIR = os.path.join(os.path.dirname(__file__), "static")
if os.path.isdir(_STATIC_DIR):
    _assets_dir = os.path.join(_STATIC_DIR, "assets")
    if os.path.isdir(_assets_dir):
        app.mount("/assets", StaticFiles(directory=_assets_dir), name="assets")

    @app.get("/{full_path:path}")
    async def _serve_spa(full_path: str):
        # Unknown API paths should 404 as JSON, not fall back to the SPA shell.
        if full_path.startswith(("api", "tiles", "health")):
            return SafeJSONResponse(status_code=404, content={"success": False, "error": "Not found"})
        candidate = os.path.join(_STATIC_DIR, full_path)
        if full_path and os.path.isfile(candidate):
            return FileResponse(candidate)
        return FileResponse(os.path.join(_STATIC_DIR, "index.html"))


# AWS Lambda entry point (referenced by template.yaml Handler: app.main.handler).
handler = Mangum(app, lifespan="off")
