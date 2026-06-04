from __future__ import annotations

import threading
import uuid

import pytest

from app import rate_limit, repo

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


def test_try_consume_is_atomic_under_concurrency(client):
    email = f"rl_atomic_{uuid.uuid4().hex[:8]}@example.com"
    client.post("/v1/auth/register", json={"email": email, "password": "secret12345"})
    user0 = repo.get_user_by_email(email)
    assert user0 is not None
    uid = int(user0["id"])
    repo.update_user(uid, {"rate_limit_per_hour": 1})
    user = repo.get_user_by_email(email)

    results: list[bool] = []
    lock = threading.Lock()

    def worker() -> None:
        allowed, _used, _limit, _rid = rate_limit.try_consume(user)
        with lock:
            results.append(allowed)

    threads = [threading.Thread(target=worker) for _ in range(20)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()

    assert sum(1 for a in results if a) == 1, results
    assert rate_limit.usage_last_hour(uid) == 1


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
