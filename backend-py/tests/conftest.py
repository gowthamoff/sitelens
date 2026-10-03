"""
Shared fixtures. app.db opens a psycopg pool at import time, so the pool class is
swapped for an inert stub BEFORE anything imports the app — tests run offline.
"""
import os

os.environ.setdefault("NODE_ENV", "test")
os.environ.setdefault("JWT_SECRET", "test-secret")
os.environ.pop("GOOGLE_PLACES_KEY", None)

import psycopg_pool  # noqa: E402


class _NoPool:
    def __init__(self, *args, **kwargs):
        pass

    def connection(self, *args, **kwargs):
        raise RuntimeError("database access is disabled in tests")


psycopg_pool.ConnectionPool = _NoPool

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app.auth import require_auth  # noqa: E402
from app.main import app  # noqa: E402

TEST_USER = {"sub": "test-user", "email": "t@x", "role": "user"}


@pytest.fixture
def client():
    app.dependency_overrides[require_auth] = lambda: TEST_USER
    try:
        yield TestClient(app)
    finally:
        app.dependency_overrides.clear()


@pytest.fixture
def anon_client():
    app.dependency_overrides.clear()
    return TestClient(app)
