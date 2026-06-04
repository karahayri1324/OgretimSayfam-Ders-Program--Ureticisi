from __future__ import annotations

from pathlib import Path

ADMIN_HTML = Path(__file__).resolve().parent.parent / "app" / "static" / "admin.html"


def test_admin_panel_sends_csp_header(client):
    r = client.get("/admin")
    assert r.status_code == 200
    csp = r.headers.get("Content-Security-Policy")
    assert csp is not None
    assert "default-src 'self'" in csp
    assert "object-src 'none'" in csp
    assert r.headers.get("X-Content-Type-Options") == "nosniff"


def test_admin_html_escapes_user_controlled_fields():
    html = ADMIN_HTML.read_text(encoding="utf-8")
    assert "function esc(" in html
    assert "esc(u.email" in html
    assert "esc(u.name" in html
    assert "esc(u.school" in html
    assert "Content-Security-Policy" in html
