from __future__ import annotations

import uuid

from .conftest import auth_headers


def _token(client) -> str:
    email = f"user_{uuid.uuid4().hex[:10]}@example.com"
    return client.post(
        "/v1/auth/register", json={"email": email, "password": "secret12345"}
    ).json()["token"]


def test_ai_request_rejects_oversized_tool_args(client):
    # #15: args dict[str,Any] eskiden sınırsızdı; per-eleman boyut sınırı doğrulamayı 422 yapmalı.
    token = _token(client)
    huge = "x" * 30_000
    body = {
        "text": "merhaba",
        "context": {},
        "toolHistory": [{"tool": "t", "args": {"blob": huge}}],
    }
    r = client.post("/v1/ai/respond", json=body, headers=auth_headers(token))
    assert r.status_code == 422, r.text
    assert r.json()["error"] == "validation"


def test_ai_request_rejects_oversized_tool_result(client):
    # #15: result Any=None eskiden sınırsızdı.
    token = _token(client)
    body = {
        "text": "merhaba",
        "context": {},
        "toolHistory": [{"tool": "t", "args": {}, "result": "y" * 60_000}],
    }
    r = client.post("/v1/ai/respond", json=body, headers=auth_headers(token))
    assert r.status_code == 422, r.text


def test_ai_request_rejects_oversized_entity_name(client):
    # #15: list[str] elemanları (öğretmen/sınıf adı) artık tek tek max_length=200 ile sınırlı.
    token = _token(client)
    body = {
        "text": "merhaba",
        "context": {"teachers": ["a" * 5_000]},
    }
    r = client.post("/v1/ai/respond", json=body, headers=auth_headers(token))
    assert r.status_code == 422, r.text
