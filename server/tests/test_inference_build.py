from __future__ import annotations

import json
from pathlib import Path

from app.inference import NO_MORE_TOOLS_SUFFIX, build_messages, system_prompt
from app.models import AIRequest

ROOT = Path(__file__).resolve().parent.parent
REPO_PROMPT = ROOT.parent / "Plans" / "dataset_samples" / "system_prompt.txt"


def _req(**kw) -> AIRequest:
    base = {
        "text": "11C ilk derse girmesin",
        "context": {
            "teachers": ["Ahmet Yılmaz", "Ayşe Çörekçi"],
            "classes": ["9A", "10B"],
            "subjects": ["Matematik", "Fizik"],
            "rooms": ["201", "Fizik Lab"],
            "days": ["Pazartesi", "Cuma"],
            "hoursPerDay": 8,
            "constraints": [],
        },
    }
    base.update(kw)
    return AIRequest(**base)


def test_system_prompt_is_stripped_and_nonempty():
    sp = system_prompt()
    assert sp == sp.strip()
    assert len(sp) > 100


def test_server_prompt_matches_repo_dataset_byte_for_byte():
    """DEPLOYMENT-KRİTİK: serving system prompt eğitimle byte-eş olmalı."""
    if not REPO_PROMPT.exists():
        return
    repo_stripped = REPO_PROMPT.read_text(encoding="utf-8").strip()
    assert system_prompt() == repo_stripped


def test_first_user_message_context_format():
    msgs = build_messages(_req())
    assert msgs[0]["role"] == "system"
    assert msgs[0]["content"] == system_prompt()
    assert msgs[1]["role"] == "user"
    content = msgs[1]["content"]
    expected_ctx = (
        "[CONTEXT]\n"
        'TEACHERS: ["Ahmet Yılmaz", "Ayşe Çörekçi"]\n'
        'CLASSES: ["9A", "10B"]\n'
        'SUBJECTS: ["Matematik", "Fizik"]\n'
        'ROOMS: ["201", "Fizik Lab"]\n'
        'DAYS: ["Pazartesi", "Cuma"]\n'
        "HOURS_PER_DAY: 8\n"
        "CONSTRAINTS: []\n"
        "[/CONTEXT]\n\n"
        "[USER_REQUEST]\n11C ilk derse girmesin\n[/USER_REQUEST]"
    )
    assert content == expected_ctx


def test_turkish_chars_preserved_not_escaped():
    msgs = build_messages(_req())
    assert "Ahmet Yılmaz" in msgs[1]["content"]
    assert "\\u" not in msgs[1]["content"]


def test_no_more_tools_appends_suffix():
    plain = build_messages(_req(noMoreTools=False))
    last = build_messages(_req(noMoreTools=True))
    assert plain[0]["content"] == system_prompt()
    assert last[0]["content"] == system_prompt() + NO_MORE_TOOLS_SUFFIX
    assert "[SON TUR]" in last[0]["content"]


def test_tool_history_emits_assistant_then_tool_result():
    req = _req(
        toolHistory=[
            {
                "role": "tool",
                "tool": "getTeacherTimetable",
                "args": {"teacher": "Ahmet Yılmaz"},
                "result": {"totalHours": 12},
                "reasoning": "Öğretmenin programını görmem gerek.",
            }
        ]
    )
    msgs = build_messages(req)
    assert len(msgs) == 4
    assert msgs[2]["role"] == "assistant"
    assert msgs[2]["content"] == (
        '{"kind": "tool_call", "tool": "getTeacherTimetable", '
        '"args": {"teacher": "Ahmet Yılmaz"}, '
        '"reasoning": "Öğretmenin programını görmem gerek."}'
    )
    assert json.loads(msgs[2]["content"]) == {
        "kind": "tool_call",
        "tool": "getTeacherTimetable",
        "args": {"teacher": "Ahmet Yılmaz"},
        "reasoning": "Öğretmenin programını görmem gerek.",
    }
    assert msgs[3]["role"] == "user"
    tr = msgs[3]["content"]
    assert tr.startswith("[TOOL_RESULT]\ntool: getTeacherTimetable\n")
    assert tr.endswith("[/TOOL_RESULT]")
    assert '"totalHours": 12' in tr


def test_history_entries_inserted_before_context():
    req = _req(history=[{"role": "user", "text": "merhaba"}, {"role": "assistant", "text": "{}"}])
    msgs = build_messages(req)
    assert msgs[1] == {"role": "user", "content": "merhaba"}
    assert msgs[2] == {"role": "assistant", "content": "{}"}
    assert "[CONTEXT]" in msgs[3]["content"]
