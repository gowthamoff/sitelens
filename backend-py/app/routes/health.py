import time

from fastapi import APIRouter

router = APIRouter()
_BOOT = time.time()


@router.get("/health")
def health():
    # Mirrors server.js: { status, uptime } (uptime in seconds since cold start).
    return {"status": "ok", "uptime": round(time.time() - _BOOT, 3)}
