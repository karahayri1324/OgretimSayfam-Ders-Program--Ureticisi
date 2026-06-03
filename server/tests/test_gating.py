from __future__ import annotations

import uuid

from app import repo
from app.config import DEFAULT_BLOCK_MESSAGE

from .conftest import auth_headers

CTX = {
    "teachers": ["A"],
    "classes": ["9A"],
    "subjects": ["Mat"],
    "rooms": ["1"],
    "days": ["Pazartesi"],
    "hoursPerDay": 8,
    "constraints": [],
}


def _register(client):
    email = f"u_{uuid.uuid4().hex[:10]}@example.com"
    res = client.post("/v1/auth/register", json={"email": email, "password": "secret12345"})
    data = res.json()
    return email, data["token"], data["user"]["id"]


def _ai(client, token, **kw):
    body = {"text": "merhaba", "context": CTX}
    body.update(kw)
    return client.post("/v1/ai/respond", json=body, headers=auth_headers(token))


def test_blocked_user_gets_403_default_message(client):
    _, token, uid = _register(client)
    repo.update_user(uid, {"status": "blocked"})
    res = _ai(client, token)
    assert res.status_code == 403
    body = res.json()
    assert body["error"] == "subscription_required"
    assert body["message"] == DEFAULT_BLOCK_MESSAGE


def test_blocked_user_custom_message_overrides(client):
    _, token, uid = _register(client)
    repo.update_user(uid, {"status": "blocked", "block_message": "Sana özel: yenile."})
    res = _ai(client, token)
    assert res.status_code == 403
    assert res.json()["message"] == "Sana özel: yenile."


def test_demo_expiry_in_past_blocks(client):
    _, token, uid = _register(client)
    repo.update_user(uid, {"demo_expires_at": "2000-01-01T00:00:00Z"})
    res = _ai(client, token)
    assert res.status_code == 403


def test_demo_expiry_unparseable_fails_closed(client):
    _, token, uid = _register(client)
    repo.update_user(uid, {"demo_expires_at": "bozuk-tarih"})
    assert _ai(client, token).status_code == 403


def test_demo_expiry_in_future_allows(client, monkeypatch):
    async def fake(_payload):
        return {"kind": "query", "answer": "ok"}

    monkeypatch.setattr("app.routers.ai.run_inference", fake)
    _, token, uid = _register(client)
    repo.update_user(uid, {"demo_expires_at": "2999-01-01T00:00:00Z"})
    res = _ai(client, token)
    assert res.status_code == 200


def test_unauthenticated_respond_401(client):
    res = client.post("/v1/ai/respond", json={"text": "x", "context": CTX})
    assert res.status_code == 401
