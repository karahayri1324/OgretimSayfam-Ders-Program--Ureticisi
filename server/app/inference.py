from __future__ import annotations

import json
from functools import lru_cache
from typing import Any

import httpx

from .config import settings
from .models import AIRequest


class UpstreamError(Exception):
    def __init__(self, message: str, status: int = 502) -> None:
        super().__init__(message)
        self.status = status


NO_MORE_TOOLS_SUFFIX = (
    "\n\n[SON TUR] Bu turda tool_call ÜRETME. Eldeki bilgiyle nihai cevabı "
    "(query / data_mutation / constraint / schedule_update / run_solver) döndür."
)


@lru_cache(maxsize=1)
def system_prompt() -> str:
    """system_prompt.txt — eğitimdeki ile BYTE-EŞ olmalı (generate_dataset.py:31)."""
    with open(settings.system_prompt_path, encoding="utf-8") as fh:
        return fh.read().strip()


def _j(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False)


def build_messages(payload: AIRequest) -> list[dict[str, str]]:
    """Electron payload'ını modelin eğitildiği OpenAI `messages` formatına çevirir.

    Sıra ve biçim generate_dataset.py (format_context / make_user_msg /
    format_tool_result / example_multiturn) ile BİREBİR aynıdır. En ufak sapma
    modele dağıtım-dışı (OOD) girdi verir ve kaliteyi düşürür.
    """
    sys = system_prompt()
    if payload.noMoreTools:
        sys += NO_MORE_TOOLS_SUFFIX

    msgs: list[dict[str, str]] = [{"role": "system", "content": sys}]

    for h in payload.history:
        if h.role in ("user", "assistant", "system"):
            msgs.append({"role": h.role, "content": h.text})

    c = payload.context
    context_block = (
        "[CONTEXT]\n"
        f"TEACHERS: {_j(c.teachers)}\n"
        f"CLASSES: {_j(c.classes)}\n"
        f"SUBJECTS: {_j(c.subjects)}\n"
        f"ROOMS: {_j(c.rooms)}\n"
        f"DAYS: {_j(c.days)}\n"
        f"HOURS_PER_DAY: {c.hoursPerDay}\n"
        f"CONSTRAINTS: {_j(c.constraints)}\n"
        "[/CONTEXT]"
    )
    msgs.append(
        {
            "role": "user",
            "content": f"{context_block}\n\n[USER_REQUEST]\n{payload.text}\n[/USER_REQUEST]",
        }
    )

    for t in payload.toolHistory:
        msgs.append(
            {
                "role": "assistant",
                "content": _j(
                    {
                        "kind": "tool_call",
                        "tool": t.tool,
                        "args": t.args,
                        "reasoning": t.reasoning,
                    }
                ),
            }
        )
        msgs.append(
            {
                "role": "user",
                "content": (
                    "[TOOL_RESULT]\n"
                    f"tool: {t.tool}\n"
                    f"args: {_j(t.args)}\n"
                    f"result: {_j(t.result)}\n"
                    "[/TOOL_RESULT]"
                ),
            }
        )

    return msgs


def coerce_json(raw: Any) -> Any:
    """Modelin metnini JSON nesnesine çevirir (client.ts coerceJson ile aynı mantık)."""
    if isinstance(raw, (dict, list)):
        return raw
    if not isinstance(raw, str):
        return raw
    s = raw.strip()
    if s.startswith("```"):
        body = s.split("```", 2)
        if len(body) >= 2:
            chunk = body[1]
            if chunk.lower().startswith("json"):
                chunk = chunk[4:]
            s = chunk.strip()
    try:
        return json.loads(s)
    except json.JSONDecodeError:
        pass
    i = s.find("{")
    j = s.rfind("}")
    if i >= 0 and j > i:
        try:
            return json.loads(s[i : j + 1])
        except json.JSONDecodeError:
            pass
    return raw


async def run_inference(payload: AIRequest) -> Any:
    """Mesajları kurar, upstream vLLM'e iletir, JSON yanıtı döndürür."""
    messages = build_messages(payload)
    body: dict[str, Any] = {
        "model": settings.upstream_model,
        "messages": messages,
        "temperature": settings.upstream_temperature,
        "max_tokens": settings.upstream_max_tokens,
        "stream": False,
    }
    headers = {"Content-Type": "application/json"}
    if settings.upstream_api_key:
        headers["Authorization"] = f"Bearer {settings.upstream_api_key}"

    url = settings.upstream_base_url.rstrip("/") + "/v1/chat/completions"
    try:
        async with httpx.AsyncClient(timeout=settings.upstream_timeout_sec) as client:
            resp = await client.post(url, json=body, headers=headers)
    except httpx.TimeoutException as exc:
        raise UpstreamError("Model yanıt vermedi (zaman aşımı).", status=504) from exc
    except httpx.HTTPError as exc:
        raise UpstreamError(f"Modele ulaşılamadı: {exc}", status=502) from exc

    if resp.status_code >= 400:
        raise UpstreamError(
            f"Model upstream hatası (HTTP {resp.status_code}).", status=502
        )

    try:
        data = resp.json()
        content = data["choices"][0]["message"]["content"]
    except (json.JSONDecodeError, KeyError, IndexError, TypeError) as exc:
        raise UpstreamError("Model yanıtı çözümlenemedi.", status=502) from exc

    result = coerce_json(content)
    # coerce_json çözemezse ham string'i geri veriyordu → endpoint HTTP-200 + çöp gövde
    # döndürür, client AI_INVALID_RESPONSE gösterir AMA kota zaten tüketildi ve iade EDİLMEZDİ
    # (#17, örn. max_tokens ile yarıda kesilmiş JSON / düz metin). Yapısal olmayan çıktıyı
    # upstream hatası say → kota iadesi (ai.py) + temiz hata. Sözleşme her zaman dict/list bekler.
    if not isinstance(result, (dict, list)):
        raise UpstreamError("Model geçerli JSON üretmedi.", status=502)
    return result
