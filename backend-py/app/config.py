"""
Centralized environment configuration — Python port of server/config/env.js.

On Lambda everything comes from environment variables set by the SAM template
(see ../template.yaml). There is no 'local vs rds' switch anymore: the function
always talks to one Postgres/PostGIS via the RDS_* vars. For local `sam local`
testing you can point those at any reachable PostGIS instance.
"""
import os
import sys

# ── Database (single target — the new public RDS) ──
DB_HOST = os.environ.get("RDS_HOST")
DB_PORT = int(os.environ.get("RDS_PORT", "5432"))
DB_NAME = os.environ.get("RDS_DB")
DB_USER = os.environ.get("RDS_USER")
DB_PASS = os.environ.get("RDS_PASS")
# RDS forces TLS; 'require' encrypts without local CA verification (matches the
# old Node `ssl: { rejectUnauthorized: false }`). Override with RDS_SSLMODE if you
# ship the RDS CA bundle and want 'verify-full'.
DB_SSLMODE = os.environ.get("RDS_SSLMODE", "require")

# ── Auth ──
JWT_SECRET = os.environ.get("JWT_SECRET")
JWT_EXPIRES_IN = os.environ.get("JWT_EXPIRES_IN", "7d")

# ── External services ──
GOOGLE_PLACES_KEY = os.environ.get("GOOGLE_PLACES_KEY") or None

# ── CORS ──
ALLOWED_ORIGIN = os.environ.get("ALLOWED_ORIGIN", "*")

NODE_ENV = os.environ.get("NODE_ENV", "production")

# Validate critical secrets the same way env.js did (fatal in production).
if not DB_PASS:
    print("CRITICAL: RDS_PASS is missing in the environment!", file=sys.stderr)

if not JWT_SECRET:
    if NODE_ENV == "production":
        print("CRITICAL: JWT_SECRET is missing in production!", file=sys.stderr)
    else:
        print("WARNING: JWT_SECRET not set — using insecure dev placeholder.", file=sys.stderr)
        JWT_SECRET = "dev-only-insecure-secret-change-me"
