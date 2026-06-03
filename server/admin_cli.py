#!/usr/bin/env python3
"""api4 köprü — komut satırı yönetim aracı.

VPS'te doğrudan DB üzerinde çalışır (HTTP gerekmez). Örnekler:

    python admin_cli.py list
    python admin_cli.py show ahmet@okul.com
    python admin_cli.py create-admin ben@ogretimsayfam.com 'GucluSifre123'
    python admin_cli.py block ahmet@okul.com
    python admin_cli.py block ahmet@okul.com --message 'Size özel: aboneliğinizi yenileyin.'
    python admin_cli.py unblock ahmet@okul.com
    python admin_cli.py set-limit ahmet@okul.com 250
    python admin_cli.py set-expiry ahmet@okul.com 2026-07-01T00:00:00Z
    python admin_cli.py reset-usage ahmet@okul.com
    python admin_cli.py settings
    python admin_cli.py set-default-limit 100
    python admin_cli.py set-default-message 'Demo limitiniz dolmuştur ...'
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from app import db, gating, rate_limit, repo
from app.config import DEFAULT_BLOCK_MESSAGE


def _find(email_or_id: str):
    if email_or_id.isdigit():
        user = repo.get_user_by_id(int(email_or_id))
    else:
        user = repo.get_user_by_email(email_or_id)
    if user is None:
        print(f"Kullanıcı bulunamadı: {email_or_id}", file=sys.stderr)
        sys.exit(1)
    return user


def _print_user(user) -> None:
    blocked = gating.is_blocked(user)
    print(f"  #{user['id']}  {user['email']}")
    print(f"     ad/okul     : {user['name'] or '-'} / {user['school'] or '-'}")
    print(f"     durum       : {user['status']}  (engelli={'EVET' if blocked else 'hayır'})")
    print(f"     admin       : {'evet' if user['is_admin'] else 'hayır'}")
    print(
        f"     saatlik kota: {user['rate_limit_per_hour'] if user['rate_limit_per_hour'] is not None else 'global'} "
        f"(etkin={rate_limit.effective_limit(user)})  kullanım(1s)={rate_limit.usage_last_hour(int(user['id']))}"
    )
    print(f"     demo bitiş  : {user['demo_expires_at'] or '-'}")
    print(f"     özel mesaj  : {user['block_message'] or '(varsayılan)'}")


def cmd_list(args) -> None:
    users = repo.list_users(args.query, args.limit, 0)
    print(f"Toplam (gösterilen): {len(users)} / kayıtlı {repo.count_users()}")
    for u in users:
        _print_user(u)


def cmd_show(args) -> None:
    _print_user(_find(args.user))


def cmd_create_admin(args) -> None:
    if repo.get_user_by_email(args.email):
        print("Bu e-posta zaten kayıtlı; admin yapmak için: set-admin", file=sys.stderr)
        sys.exit(1)
    repo.create_user(args.email, args.password, "Yönetici", None, is_admin=True)
    print(f"Admin oluşturuldu: {args.email}")


def cmd_set_admin(args) -> None:
    u = _find(args.user)
    repo.update_user(int(u["id"]), {"is_admin": not args.remove})
    print(f"{u['email']} admin={'hayır' if args.remove else 'evet'}")


def cmd_block(args) -> None:
    u = _find(args.user)
    fields: dict[str, object] = {"status": "blocked"}
    if args.message is not None:
        fields["block_message"] = args.message
    repo.update_user(int(u["id"]), fields)
    print(f"{u['email']} ENGELLENDİ. Gösterilecek mesaj:")
    print(f"  → {gating.resolve_block_message(repo.get_user_by_id(int(u['id'])))}")


def cmd_unblock(args) -> None:
    u = _find(args.user)
    repo.update_user(int(u["id"]), {"status": "active", "demo_expires_at": None})
    print(f"{u['email']} engeli kaldırıldı (aktif).")


def cmd_set_message(args) -> None:
    u = _find(args.user)
    repo.update_user(int(u["id"]), {"block_message": args.message or None})
    print(f"{u['email']} özel mesajı güncellendi.")


def cmd_set_limit(args) -> None:
    u = _find(args.user)
    value = None if args.limit < 0 else args.limit
    repo.update_user(int(u["id"]), {"rate_limit_per_hour": value})
    print(f"{u['email']} saatlik kota = {value if value is not None else 'global'}")


def cmd_set_expiry(args) -> None:
    u = _find(args.user)
    repo.update_user(int(u["id"]), {"demo_expires_at": args.when or None})
    print(f"{u['email']} demo bitişi = {args.when or '-'}")


def cmd_reset_usage(args) -> None:
    u = _find(args.user)
    rate_limit.reset_usage(int(u["id"]))
    print(f"{u['email']} saatlik kullanım sayacı sıfırlandı.")


def cmd_delete(args) -> None:
    u = _find(args.user)
    repo.delete_user(int(u["id"]))
    print(f"{u['email']} silindi.")


def cmd_settings(_args) -> None:
    print("Global ayarlar:")
    print(f"  default_rate_limit_per_hour: {rate_limit.global_default_limit()}")
    print(f"  default_block_message      : {db.get_app_setting('default_block_message') or '(kod varsayılanı)'}")
    print(f"  rate_limit_message         : {rate_limit.limit_message()}")
    print(f"  (kod varsayılan engel msj) : {DEFAULT_BLOCK_MESSAGE}")


def cmd_set_default_limit(args) -> None:
    db.set_app_setting("default_rate_limit_per_hour", str(args.limit))
    print(f"Global saatlik kota = {args.limit}")


def cmd_set_default_message(args) -> None:
    db.set_app_setting("default_block_message", args.message)
    print("Global engel mesajı güncellendi.")


def cmd_set_ratelimit_message(args) -> None:
    db.set_app_setting("rate_limit_message", args.message)
    print("Kota aşım mesajı güncellendi.")


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(description="api4 köprü yönetim CLI")
    sub = p.add_subparsers(dest="cmd", required=True)

    s = sub.add_parser("list", help="kullanıcıları listele")
    s.add_argument("--query", default=None)
    s.add_argument("--limit", type=int, default=100)
    s.set_defaults(func=cmd_list)

    s = sub.add_parser("show", help="bir kullanıcının detayı")
    s.add_argument("user")
    s.set_defaults(func=cmd_show)

    s = sub.add_parser("create-admin", help="yeni admin kullanıcı oluştur")
    s.add_argument("email")
    s.add_argument("password")
    s.set_defaults(func=cmd_create_admin)

    s = sub.add_parser("set-admin", help="kullanıcıyı admin yap / admin'liği kaldır")
    s.add_argument("user")
    s.add_argument("--remove", action="store_true")
    s.set_defaults(func=cmd_set_admin)

    s = sub.add_parser("block", help="kullanıcıyı engelle (demo bitir)")
    s.add_argument("user")
    s.add_argument("--message", default=None, help="bu kullanıcıya özel uyarı mesajı")
    s.set_defaults(func=cmd_block)

    s = sub.add_parser("unblock", help="engeli kaldır")
    s.add_argument("user")
    s.set_defaults(func=cmd_unblock)

    s = sub.add_parser("set-message", help="kullanıcıya özel engel mesajı ata (boş=temizle)")
    s.add_argument("user")
    s.add_argument("message", nargs="?", default="")
    s.set_defaults(func=cmd_set_message)

    s = sub.add_parser("set-limit", help="kullanıcı saatlik kotası (-1 = global)")
    s.add_argument("user")
    s.add_argument("limit", type=int)
    s.set_defaults(func=cmd_set_limit)

    s = sub.add_parser("set-expiry", help="demo bitiş tarihi (ISO8601, boş=temizle)")
    s.add_argument("user")
    s.add_argument("when", nargs="?", default="")
    s.set_defaults(func=cmd_set_expiry)

    s = sub.add_parser("reset-usage", help="saatlik kullanım sayacını sıfırla")
    s.add_argument("user")
    s.set_defaults(func=cmd_reset_usage)

    s = sub.add_parser("delete", help="kullanıcıyı sil")
    s.add_argument("user")
    s.set_defaults(func=cmd_delete)

    s = sub.add_parser("settings", help="global ayarları göster")
    s.set_defaults(func=cmd_settings)

    s = sub.add_parser("set-default-limit", help="global saatlik kota")
    s.add_argument("limit", type=int)
    s.set_defaults(func=cmd_set_default_limit)

    s = sub.add_parser("set-default-message", help="global engel mesajı")
    s.add_argument("message")
    s.set_defaults(func=cmd_set_default_message)

    s = sub.add_parser("set-ratelimit-message", help="kota aşım mesajı")
    s.add_argument("message")
    s.set_defaults(func=cmd_set_ratelimit_message)

    return p


def main() -> None:
    db.init_db()
    args = build_parser().parse_args()
    args.func(args)


if __name__ == "__main__":
    main()
