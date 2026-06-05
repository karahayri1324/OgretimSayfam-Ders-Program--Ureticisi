from __future__ import annotations

from app.inference import build_messages
from app.models import AIRequest


def _req(**kw) -> AIRequest:
    base = {
        "text": "neden olmadı?",
        "context": {
            "teachers": ["Ahmet Yılmaz"],
            "classes": ["9A"],
            "subjects": ["Matematik"],
            "rooms": ["201"],
            "days": ["Pazartesi", "Cuma"],
            "hoursPerDay": 8,
            "constraints": [],
        },
    }
    base.update(kw)
    return AIRequest(**base)


def _ctx_block(content: str) -> str:
    return content.split("\n\n[USER_REQUEST]")[0]


def test_no_failure_means_no_line_and_unchanged_format():
    """KRİTİK: hata yokken blok mevcut eğitim formatıyla byte-eş (regen gerekmez)."""
    msgs = build_messages(_req())
    block = _ctx_block(msgs[1]["content"])
    assert "LAST_GENERATION_FAILURE" not in block
    assert block.endswith("CONSTRAINTS: []\n[/CONTEXT]")


def test_failure_line_present_partial_with_counts():
    failure = {
        "reason": "PARTIAL",
        "message": "3/40 ders yerleştirilemedi.",
        "unplaced": 3,
        "total": 40,
    }
    ctx = dict(_req().context.model_dump())
    ctx["lastGenerationFailure"] = failure
    msgs = build_messages(_req(context=ctx))
    block = _ctx_block(msgs[1]["content"])
    expected_line = (
        'LAST_GENERATION_FAILURE: {"reason": "PARTIAL", '
        '"message": "3/40 ders yerleştirilemedi.", "unplaced": 3, "total": 40}'
    )
    assert expected_line in block
    # Satır CONSTRAINTS'ten SONRA ve [/CONTEXT]'ten ÖNCE gelmeli.
    assert block.index("CONSTRAINTS:") < block.index("LAST_GENERATION_FAILURE:")
    assert block.index("LAST_GENERATION_FAILURE:") < block.index("[/CONTEXT]")


def test_failure_without_counts_omits_optional_keys():
    failure = {"reason": "NO_SOLUTION", "message": "Çözüm bulunamadı."}
    ctx = dict(_req().context.model_dump())
    ctx["lastGenerationFailure"] = failure
    msgs = build_messages(_req(context=ctx))
    block = _ctx_block(msgs[1]["content"])
    expected_line = (
        'LAST_GENERATION_FAILURE: {"reason": "NO_SOLUTION", "message": "Çözüm bulunamadı."}'
    )
    assert expected_line in block
    assert "unplaced" not in block
    assert "total" not in block


def test_failure_turkish_not_escaped():
    failure = {"reason": "NO_SOLUTION", "message": "Çözüm bulunamadı — kısıtlar çatışıyor."}
    ctx = dict(_req().context.model_dump())
    ctx["lastGenerationFailure"] = failure
    msgs = build_messages(_req(context=ctx))
    assert "Çözüm bulunamadı" in msgs[1]["content"]
    assert "\\u" not in msgs[1]["content"]
