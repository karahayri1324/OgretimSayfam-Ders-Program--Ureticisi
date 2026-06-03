from __future__ import annotations

import os
import sys
import tempfile
from pathlib import Path

_TMP_DB = Path(tempfile.mkdtemp(prefix="api4test_")) / "test.db"
os.environ["DB_PATH"] = str(_TMP_DB)
os.environ["JWT_SECRET"] = "test-secret-key-please-32-bytes-long-aaaa"
os.environ["DEFAULT_RATE_LIMIT_PER_HOUR"] = "100"
os.environ.setdefault("ADMIN_EMAIL", "")
os.environ.setdefault("ADMIN_PASSWORD", "")

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

import pytest
from fastapi.testclient import TestClient

from app import db, repo
from app.main import app


@pytest.fixture(autouse=True)
def _reset_global_settings():
    """Testler tek DB paylaşır; global app_settings'i her testten önce sıfırla."""
    db.init_db()
    db.set_app_setting("default_block_message", "")
    db.set_app_setting("rate_limit_message", "")
    db.set_app_setting("default_rate_limit_per_hour", "100")
    yield


@pytest.fixture()
def client():
    with TestClient(app) as c:
        yield c


@pytest.fixture()
def admin_token(client):
    email = "admin@example.com"
    if repo.get_user_by_email(email) is None:
        repo.create_user(email, "adminpass123", "Admin", None, is_admin=True)
    res = client.post("/v1/auth/login", json={"email": email, "password": "adminpass123"})
    assert res.status_code == 200, res.text
    return res.json()["token"]


def auth_headers(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}
