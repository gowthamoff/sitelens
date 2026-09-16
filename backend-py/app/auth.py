"""
JWT + bcrypt helpers and the require_auth dependency.

Ports:
  - signToken / token verify  ← jsonwebtoken (HS256)  in authService.js / middleware/auth.js
  - bcrypt hash/compare       ← bcryptjs              in authService.js
"""
import re
import time

import bcrypt
import jwt
from fastapi import Request

from . import config
from .common import AuthError

SALT_ROUNDS = 10
_ALGO = "HS256"


# ── bcrypt ──
def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt(rounds=SALT_ROUNDS)).decode("utf-8")


def check_password(password: str, password_hash: str) -> bool:
    try:
        return bcrypt.checkpw(password.encode("utf-8"), password_hash.encode("utf-8"))
    except (ValueError, TypeError):
        return False


# A fixed dummy hash so login() can always run a compare and keep response timing
# uniform (defeats user-enumeration via timing). Same intent as authService.js.
DUMMY_HASH = "$2a$10$CwTycUXWue0Thq9StjUM0uJ8.6h2Qf3kQ9b6kF1q2u3v4w5x6y7zO"


def check_dummy():
    check_password("dummy", DUMMY_HASH)


# ── JWT ──
def _expires_in_seconds(spec: str) -> int:
    """Parse a jsonwebtoken-style duration ('7d','12h','30m','3600s' or plain seconds)."""
    if spec is None:
        return 7 * 86400
    m = re.fullmatch(r"\s*(\d+)\s*([smhd]?)\s*", str(spec))
    if not m:
        return 7 * 86400
    n = int(m.group(1))
    unit = m.group(2)
    return n * {"s": 1, "m": 60, "h": 3600, "d": 86400, "": 1}[unit]


def sign_token(user: dict) -> str:
    """Standard claims: sub = user id. Keep the payload small (matches signToken)."""
    now = int(time.time())
    payload = {
        "sub": user["id"],
        "email": user["email"],
        "role": user.get("role"),
        "iat": now,
        "exp": now + _expires_in_seconds(config.JWT_EXPIRES_IN),
    }
    return jwt.encode(payload, config.JWT_SECRET, algorithm=_ALGO)


def verify_token(token: str) -> dict:
    return jwt.decode(token, config.JWT_SECRET, algorithms=[_ALGO])


def require_auth(request: Request) -> dict:
    """FastAPI dependency — verifies the Bearer token, returns the decoded payload.

    Raises AuthError(401) with the same messages as middleware/auth.js.
    """
    header = request.headers.get("authorization") or ""
    token = header[7:].strip() if header.startswith("Bearer ") else None

    if not token:
        raise AuthError("Authentication required")

    try:
        return verify_token(token)  # {sub, email, role, iat, exp}
    except jwt.ExpiredSignatureError:
        raise AuthError("Session expired, please log in again")
    except jwt.InvalidTokenError:
        raise AuthError("Invalid token")
