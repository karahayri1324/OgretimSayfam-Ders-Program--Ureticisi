from __future__ import annotations

import pytest
from pydantic import ValidationError

from app.models import AdminSettingsPatch, AdminUserPatch


def test_admin_user_patch_block_message_capped():
    # Sınırsız string DB'ye yazılıp her blokta okunuyordu → DoS. Üst sınır (2000) zorunlu.
    AdminUserPatch(block_message="x" * 2000)  # tam sınır geçerli
    with pytest.raises(ValidationError):
        AdminUserPatch(block_message="x" * 2001)


def test_admin_user_patch_demo_expires_capped():
    with pytest.raises(ValidationError):
        AdminUserPatch(demo_expires_at="x" * 65)


def test_admin_settings_patch_messages_capped():
    AdminSettingsPatch(default_block_message="y" * 2000, rate_limit_message="z" * 2000)
    with pytest.raises(ValidationError):
        AdminSettingsPatch(default_block_message="y" * 2001)
    with pytest.raises(ValidationError):
        AdminSettingsPatch(rate_limit_message="z" * 2001)
