from __future__ import annotations

import uuid

from .conftest import auth_headers


def _email() -> str:
    return f"user_{uuid.uuid4().hex[:10]}@example.com"


def test_register_returns_token_and_user(client):
    email = _email()
    res = client.post(
        "/v1/auth/register",
        json={"email": email, "password": "secret12345", "name": "Ali", "school": "X Lisesi"},
    )
    assert res.status_code == 201, res.text
    data = res.json()
    assert data["token"]
    assert data["user"]["email"] == email
    assert data["user"]["status"] == "active"
    assert data["user"]["is_admin"] is False


def test_register_duplicate_email_conflicts(client):
    email = _email()
    body = {"email": email, "password": "secret12345"}
    assert client.post("/v1/auth/register", json=body).status_code == 201
    res = client.post("/v1/auth/register", json=body)
    assert res.status_code == 409
    assert res.json()["error"] == "email_exists"


def test_register_short_password_422(client):
    res = client.post("/v1/auth/register", json={"email": _email(), "password": "short"})
    assert res.status_code == 422
    assert res.json()["error"] == "validation"


def test_login_wrong_password_401(client):
    email = _email()
    client.post("/v1/auth/register", json={"email": email, "password": "secret12345"})
    res = client.post("/v1/auth/login", json={"email": email, "password": "WRONG_pass1"})
    assert res.status_code == 401
    assert res.json()["error"] == "invalid_credentials"


def test_me_requires_token(client):
    assert client.get("/v1/auth/me").status_code == 401


def test_me_with_token(client):
    email = _email()
    token = client.post(
        "/v1/auth/register", json={"email": email, "password": "secret12345"}
    ).json()["token"]
    res = client.get("/v1/auth/me", headers=auth_headers(token))
    assert res.status_code == 200
    assert res.json()["user"]["email"] == email


def test_me_with_garbage_token_401(client):
    res = client.get("/v1/auth/me", headers={"Authorization": "Bearer not.a.jwt"})
    assert res.status_code == 401


def test_login_brute_force_lockout(client):
    email = _email()
    client.post("/v1/auth/register", json={"email": email, "password": "secret12345"})
    for _ in range(8):
        r = client.post("/v1/auth/login", json={"email": email, "password": "WRONG_pass1"})
        assert r.status_code == 401
    r = client.post("/v1/auth/login", json={"email": email, "password": "WRONG_pass1"})
    assert r.status_code == 429
    assert r.json()["error"] == "too_many_attempts"
    r = client.post("/v1/auth/login", json={"email": email, "password": "secret12345"})
    assert r.status_code == 429
