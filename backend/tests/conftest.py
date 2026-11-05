import os
import sys
import tempfile
from pathlib import Path

_tmp = tempfile.mkdtemp(prefix="rsp-test-")
os.environ["RSP_DATABASE_URL"] = os.getenv("RSP_TEST_DATABASE_URL") or f"sqlite:///{_tmp}/test.db"
os.environ["RSP_STORAGE_DIR"] = f"{_tmp}/storage"
os.environ["RSP_JWT_SECRET"] = "test-secret-not-for-production-0123456789"
os.environ["RSP_RATE_LIMIT_PER_MINUTE"] = "100000"
os.environ["RSP_AI_RATE_LIMIT_PER_MINUTE"] = "100000"
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

if os.environ["RSP_DATABASE_URL"].startswith("postgresql"):
    from app.migrate import run as _migrate  # noqa: E402
    _migrate()
from app.main import app  # noqa: E402
from app.services.ratelimit import limiter  # noqa: E402


@pytest.fixture
def client():
    limiter.reset()
    return TestClient(app)


_n = [0]


def make_user(client, locale="ar"):
    _n[0] += 1
    email = f"user{_n[0]}_{os.getpid()}@example.com"
    r = client.post("/auth/register", json={"email": email, "password": "Passw0rd!x", "full_name": f"User {_n[0]}", "locale": locale})
    assert r.status_code == 201, r.text
    tok = r.json()
    h = {"Authorization": f"Bearer {tok['access_token']}"}
    ws = client.get("/workspaces", headers=h).json()[0]
    return {"email": email, "headers": h, "tokens": tok, "ws": ws["id"]}


@pytest.fixture
def user(client):
    return make_user(client)


@pytest.fixture
def other(client):
    return make_user(client)
