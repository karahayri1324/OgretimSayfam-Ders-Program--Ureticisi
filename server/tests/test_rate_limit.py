from __future__ import annotations

import uuid

import pytest

from app import repo

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


@pytest.fixture(autouse=True)
def _patch_upstream(monkeypatch):
    async def fake(_payload):
        return {"kind": "query", "answer": "ok"}

    monkeypatch.setattr("app.routers.ai.run_inference", fake)


def _register(client):
    email = f"rl_{uuid.uuid4().hex[:10]}@example.com"
    data = client.post(
        "/v1/auth/register", json={"email": email, "password": "secret12345"}
    ).json()
    return data["token"], data["user"]["id"]


def _ai(client, token, **kw):
    body = {"text": "merhaba", "context": CTX}
    body.update(kw)
    return client.post("/v1/ai/respond", json=body, headers=auth_headers(token))


def test_limit_exhausts_and_returns_429(client):
    token, uid = _register(client)
    repo.update_user(uid, {"rate_limit_per_hour": 3})
    for _ in range(3):
        assert _ai(client, token).status_code == 200
    res = _ai(client, token)
    assert res.status_code == 429
    body = res.json()
    assert body["error"] == "rate_limit"
    assert body["limit"] == 3
    assert res.headers.get("Retry-After") == "3600"


def test_every_request_counts_including_tool_turns(client):
    token, uid = _register(client)
    repo.update_user(uid, {"rate_limit_per_hour": 3})
    assert _ai(client, token).status_code == 200
    assert _ai(
        client,
        token,
        toolHistory=[{"role": "tool", "tool": "x", "args": {}, "result": {}}],
    ).status_code == 200
    assert _ai(client, token).status_code == 200
    assert _ai(
        client,
        token,
        toolHistory=[{"role": "tool", "tool": "x", "args": {}, "result": {}}],
    ).status_code == 429


def test_zero_limit_is_unlimited(client):
    token, uid = _register(client)
    repo.update_user(uid, {"rate_limit_per_hour": 0})
    for _ in range(10):
        assert _ai(client, token).status_code == 200


def test_reset_usage_via_admin(client, admin_token):
    token, uid = _register(client)
    repo.update_user(uid, {"rate_limit_per_hour": 1})
    assert _ai(client, token).status_code == 200
    assert _ai(client, token).status_code == 429
    r = client.post(
        f"/v1/admin/users/{uid}/reset-usage", headers=auth_headers(admin_token)
    )
    assert r.status_code == 200
    assert _ai(client, token).status_code == 200
