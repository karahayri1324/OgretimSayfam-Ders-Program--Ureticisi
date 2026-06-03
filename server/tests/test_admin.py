from __future__ import annotations

import uuid

from .conftest import auth_headers


def _register(client):
    email = f"adm_{uuid.uuid4().hex[:10]}@example.com"
    data = client.post(
        "/v1/auth/register", json={"email": email, "password": "secret12345"}
    ).json()
    return email, data["token"], data["user"]["id"]


def test_non_admin_cannot_list_users(client):
    _, token, _ = _register(client)
    res = client.get("/v1/admin/users", headers=auth_headers(token))
    assert res.status_code == 403


def test_admin_can_list_users(client, admin_token):
    _register(client)
    res = client.get("/v1/admin/users", headers=auth_headers(admin_token))
    assert res.status_code == 200
    assert isinstance(res.json(), list)
    assert len(res.json()) >= 1


def test_admin_block_unblock_flow(client, admin_token):
    _, _, uid = _register(client)
    r = client.post(
        f"/v1/admin/users/{uid}/block",
        json={"message": "özel mesaj"},
        headers=auth_headers(admin_token),
    )
    assert r.status_code == 200
    assert r.json()["status"] == "blocked"
    assert r.json()["block_message"] == "özel mesaj"

    r = client.post(f"/v1/admin/users/{uid}/unblock", headers=auth_headers(admin_token))
    assert r.status_code == 200
    assert r.json()["status"] == "active"


def test_admin_patch_rate_limit(client, admin_token):
    _, _, uid = _register(client)
    r = client.patch(
        f"/v1/admin/users/{uid}",
        json={"rate_limit_per_hour": 42},
        headers=auth_headers(admin_token),
    )
    assert r.status_code == 200
    assert r.json()["rate_limit_per_hour"] == 42
    assert r.json()["effective_rate_limit"] == 42


def test_admin_settings_get_and_patch(client, admin_token):
    r = client.get("/v1/admin/settings", headers=auth_headers(admin_token))
    assert r.status_code == 200
    assert "default_rate_limit_per_hour" in r.json()

    r = client.patch(
        "/v1/admin/settings",
        json={"default_rate_limit_per_hour": 250, "default_block_message": "yeni mesaj"},
        headers=auth_headers(admin_token),
    )
    assert r.status_code == 200
    assert r.json()["default_rate_limit_per_hour"] == 250
    assert r.json()["default_block_message"] == "yeni mesaj"


def test_admin_settings_default_message_used_for_blocked_user(client, admin_token):
    client.patch(
        "/v1/admin/settings",
        json={"default_block_message": "GLOBAL-MESAJ"},
        headers=auth_headers(admin_token),
    )
    _, token, uid = _register(client)
    client.post(f"/v1/admin/users/{uid}/block", headers=auth_headers(admin_token))
    res = client.post(
        "/v1/ai/respond",
        json={
            "text": "x",
            "context": {
                "teachers": [], "classes": [], "subjects": [], "rooms": [],
                "days": [], "hoursPerDay": 8, "constraints": [],
            },
        },
        headers=auth_headers(token),
    )
    assert res.status_code == 403
    assert res.json()["message"] == "GLOBAL-MESAJ"
