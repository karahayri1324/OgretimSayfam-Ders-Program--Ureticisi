from __future__ import annotations

import uuid

from app import repo

from .conftest import auth_headers


def _admin_id() -> int:
    row = repo.get_user_by_email("admin@example.com")
    assert row is not None
    return int(row["id"])


def test_cannot_delete_last_admin(client, admin_token):
    # #29: tek admin silinemez (web-panel kilitlenmesi engellenir).
    r = client.delete(f"/v1/admin/users/{_admin_id()}", headers=auth_headers(admin_token))
    assert r.status_code == 409, r.text
    assert r.json()["error"] == "last_admin"


def test_cannot_demote_last_admin(client, admin_token):
    # #29: son adminin is_admin yetkisi kaldırılamaz.
    r = client.patch(
        f"/v1/admin/users/{_admin_id()}",
        json={"is_admin": False},
        headers=auth_headers(admin_token),
    )
    assert r.status_code == 409, r.text
    assert r.json()["error"] == "last_admin"


def test_can_delete_admin_when_another_exists(client, admin_token):
    # Guard yalnız SON admini korur: ikinci admin varken ilki silinebilmeli.
    admin_id = _admin_id()
    email = f"admin2_{uuid.uuid4().hex[:8]}@example.com"
    repo.create_user(email, "adminpass123", "Admin2", None, is_admin=True)
    r = client.delete(f"/v1/admin/users/{admin_id}", headers=auth_headers(admin_token))
    assert r.status_code == 204, r.text
