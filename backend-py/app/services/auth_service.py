"""Port of server/services/authService.js — user register/login over the users table."""
import re

import psycopg

from .. import db
from ..auth import check_dummy, check_password, hash_password, sign_token
from ..common import ApiError

_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


def _public_user(row):
    # users.id is a uuid (gen_random_uuid). Cast to str so it's JSON/JWT-serializable.
    return {"id": str(row["id"]), "email": row["email"], "role": row["role"]}


def register(email, password):
    email = str(email or "").strip().lower()
    if not email or not password:
        raise ApiError("Email and password are required", 400)
    if not _EMAIL_RE.match(email):
        raise ApiError("Invalid email address", 400)
    if len(str(password)) < 8:
        raise ApiError("Password must be at least 8 characters", 400)

    pw_hash = hash_password(password)
    try:
        row = db.query_one(
            """INSERT INTO users (email, password_hash)
               VALUES (%(email)s, %(hash)s)
               RETURNING id, email, role, created_at""",
            {"email": email, "hash": pw_hash},
        )
    except psycopg.errors.UniqueViolation:
        raise ApiError("Email already registered", 409)

    user = _public_user(row)
    return {"user": user, "token": sign_token(user)}


def login(email, password):
    email = str(email or "").strip().lower()
    row = db.query_one(
        "SELECT id, email, role, password_hash FROM users WHERE lower(email) = %(email)s",
        {"email": email},
    )
    # Always run a compare to keep timing uniform (avoids user-enumeration via timing).
    if row:
        ok = check_password(str(password or ""), row["password_hash"])
    else:
        check_dummy()
        ok = False
    if not row or not ok:
        raise ApiError("Invalid email or password", 401)

    user = _public_user(row)
    return {"user": user, "token": sign_token(user)}


def get_by_id(user_id):
    return db.query_one(
        "SELECT id, email, role, created_at FROM users WHERE id = %(id)s",
        {"id": user_id},
    )
