from __future__ import annotations

import json
import logging
from functools import lru_cache
from typing import Any

import httpx

from .config import settings
from .models import AIRequest


log = logging.getLogger("bridge.inference")


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


def _failure_json(f: Any) -> str:
    """Son-üretim-hatasını CONTEXT satırı için JSON'a çevirir.

    Anahtar SIRASI sabit (reason, message, [unplaced], [total]) ve generate_dataset.py
    format_context() ile BİREBİR aynıdır — aksi halde model dağıtım-dışı (OOD) girdi alır."""
    d: dict[str, Any] = {"reason": f.reason, "message": f.message}
    if f.unplaced is not None:
        d["unplaced"] = f.unplaced
    if f.total is not None:
        d["total"] = f.total
    return _j(d)


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

    # GÜVENLİK: history istemciden gelir; 'system' rolüne İZİN VERİLMEZ. Aksi halde kötü niyetli
    # bir istemci geçmişe sahte bir system mesajı enjekte edip gerçek system prompt'u ezebilir /
    # sızdırabilir (prompt injection). Electron app zaten yalnız user/assistant gönderir, bu yüzden
    # filtre eğitim formatını (byte-eş) bozmaz — yalnız kötüye kullanım yolunu kapatır.
    for h in payload.history:
        if h.role in ("user", "assistant"):
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
    )
    # KOŞULLU alan: yalnız son üretim başarısızsa eklenir. Yokken blok mevcut eğitim
    # formatıyla byte-eş (dataset'in büyük çoğunluğu bu durumdadır → regen gerekmez).
    if c.lastGenerationFailure is not None:
        context_block += (
            f"LAST_GENERATION_FAILURE: {_failure_json(c.lastGenerationFailure)}\n"
        )
    context_block += "[/CONTEXT]"
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


def repair_json(s: str) -> str:
    """Modelin ürettiği KÜÇÜK JSON kusurlarını onarır (tırnaksız anahtar, sondaki virgül).

    Sahada görülen kusur: `..."explanation":"...",requiresConfirmation:true,...` — anahtar
    tırnaksız çıkmış. Nadir bir üretim kusuru ama tek karakter yüzünden tüm yanıt çöpe
    gidiyordu. Onarım STRING-DUYARLI tek geçişle yapılır: dize içindeki metin (Türkçe
    açıklamalar `Onayla, programı: ...` gibi ifadeler içerebilir) asla değiştirilmez —
    naif bir regex burada açıklama metnini bozardı.
    """
    out: list[str] = []
    i, n = 0, len(s)
    in_string = False
    escaped = False
    prev_sig = ""  # dize dışındaki son anlamlı karakter

    while i < n:
        ch = s[i]

        if in_string:
            out.append(ch)
            if escaped:
                escaped = False
            elif ch == "\\":
                escaped = True
            elif ch == '"':
                in_string = False
            i += 1
            continue

        if ch == '"':
            in_string = True
            out.append(ch)
            prev_sig = ch
            i += 1
            continue

        # Sondaki virgül: `,}` / `,]` → virgülü at.
        if ch == ",":
            j = i + 1
            while j < n and s[j].isspace():
                j += 1
            if j < n and s[j] in "}]":
                i += 1  # virgülü yazma
                continue
            out.append(ch)
            prev_sig = ch
            i += 1
            continue

        # Tırnaksız anahtar: yalnız `{` veya `,` sonrasında gelen ve `:` ile biten tanımlayıcı.
        if (ch.isalpha() or ch == "_") and prev_sig in ("{", ","):
            j = i
            while j < n and (s[j].isalnum() or s[j] == "_"):
                j += 1
            k = j
            while k < n and s[k].isspace():
                k += 1
            if k < n and s[k] == ":":
                out.append('"' + s[i:j] + '"')
                prev_sig = '"'
                i = j
                continue

        out.append(ch)
        if not ch.isspace():
            prev_sig = ch
        i += 1

    return "".join(out)


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
        s = s[i : j + 1]
        try:
            return json.loads(s)
        except json.JSONDecodeError:
            pass
    # Son çare: küçük biçim kusurlarını onarıp bir kez daha dene.
    try:
        parsed = json.loads(repair_json(s))
    except json.JSONDecodeError:
        return raw
    # Onarım sessiz kalırsa modelin biçim kalitesinin bozulduğunu fark edemeyiz; sayılabilsin
    # diye logla. Bu satırın sıklaşması retrain sinyalidir.
    log.warning("upstream JSON onarıldı (bozuk biçim): %r", s[:200])
    return parsed


async def run_inference(payload: AIRequest) -> Any:
    """Mesajları kurar, upstream vLLM'e iletir, JSON yanıtı döndürür."""
    messages = build_messages(payload)
    body: dict[str, Any] = {
        "model": settings.upstream_model,
        "messages": messages,
        "temperature": settings.upstream_temperature,
        "max_tokens": settings.upstream_max_tokens,
        "stream": False,
        # Eğitim formatıyla birebir eşleşme: assistant turu `<think>\n\n</think>\n\n{JSON}`
        # olarak eğitildi, üretimde de think bloğu kapalı olmalı.
        "chat_template_kwargs": {"enable_thinking": settings.upstream_enable_thinking},
    }
    headers = {"Content-Type": "application/json"}
    if settings.upstream_api_key:
        headers["Authorization"] = f"Bearer {settings.upstream_api_key}"

    url = settings.upstream_base_url.rstrip("/") + "/v1/chat/completions"

    # Bozuk çıktı NADİR ve genelde örnekleme kaynaklı tek bir kusur (ör. tırnaksız anahtar).
    # Aynı isteği bir kez daha denemek bunu neredeyse her zaman kurtarır. Yeniden deneme
    # SUNUCU tarafında yapılır: kullanıcının saatlik kotasından ikinci bir birim GİTMEZ
    # (client.ts'teki eski istemci-tarafı retry tam da bu yüzden kaldırılmıştı, #8).
    last_diag = ""
    for attempt in range(2):
        attempt_body = dict(body)
        if attempt > 0:
            # İlk deneme bozuk çıktı verdi; aynı greedy yoldan aynı kusuru üretmemesi için
            # sıcaklığı bir tık aç.
            attempt_body["temperature"] = max(settings.upstream_temperature, 0.3)

        try:
            async with httpx.AsyncClient(
                timeout=settings.upstream_timeout_sec
            ) as client:
                resp = await client.post(url, json=attempt_body, headers=headers)
        except httpx.TimeoutException as exc:
            raise UpstreamError(
                "Yapay zekâ şu anda yanıt vermedi. Lütfen tekrar deneyin.", status=504
            ) from exc
        except httpx.HTTPError as exc:
            log.error("upstream bağlantı hatası: %s", exc)
            raise UpstreamError(
                "Yapay zekâ servisine şu anda ulaşılamıyor. Lütfen biraz sonra tekrar deneyin.",
                status=502,
            ) from exc

        if resp.status_code >= 400:
            log.error("upstream HTTP %s: %s", resp.status_code, resp.text[:400])
            raise UpstreamError(
                "Yapay zekâ servisine şu anda ulaşılamıyor. Lütfen biraz sonra tekrar deneyin.",
                status=502,
            )

        try:
            data = resp.json()
            choice = data["choices"][0]
            content = choice["message"]["content"]
        except (json.JSONDecodeError, KeyError, IndexError, TypeError) as exc:
            raise UpstreamError(
                "Yapay zekâdan beklenmedik bir yanıt geldi. Lütfen tekrar deneyin.",
                status=502,
            ) from exc

        finish = choice.get("finish_reason")
        usage = data.get("usage") or {}

        # Çıktı max_tokens'a takılıp YARIDA kesildiyse JSON zaten bozuk olur. Bunu ayrı ele al:
        # sebep model kalitesi değil bütçedir ve yeniden denemek işe yaramaz — kullanıcıya
        # ne yapacağını söyleyen bir mesaj ver.
        if finish == "length":
            log.error(
                "upstream çıktı max_tokens'a takıldı: prompt=%s completion=%s limit=%s",
                usage.get("prompt_tokens"),
                usage.get("completion_tokens"),
                settings.upstream_max_tokens,
            )
            raise UpstreamError(
                "İsteğiniz tek seferde yanıtlanamayacak kadar kapsamlı. "
                "Lütfen daha küçük parçalara bölerek deneyin.",
                status=502,
            )

        result = coerce_json(content)
        # coerce_json çözemezse ham string'i geri veriyordu → endpoint HTTP-200 + çöp gövde
        # döndürür, client AI_INVALID_RESPONSE gösterir AMA kota zaten tüketildi ve iade EDİLMEZDİ
        # (#17). Yapısal olmayan çıktıyı upstream hatası say → kota iadesi (ai.py) + temiz hata.
        if isinstance(result, (dict, list)):
            if attempt > 0:
                log.info("upstream yeniden denemede düzeldi.")
            return result

        # TEŞHİS: bu dal daha önce hiçbir iz bırakmıyordu, dolayısıyla sahadaki hata
        # incelenemiyordu. Ham çıktıyı ve token sayımlarını logla (model çıktısı).
        last_diag = repr(content[:800]) if isinstance(content, str) else repr(content)
        log.error(
            "upstream JSON değil (deneme %s/2): finish=%s prompt=%s completion=%s ham=%s",
            attempt + 1,
            finish,
            usage.get("prompt_tokens"),
            usage.get("completion_tokens"),
            last_diag,
        )

    raise UpstreamError(
        "Yapay zekâ bu isteği şu anda işleyemedi. Lütfen isteğinizi biraz farklı "
        "ifade ederek tekrar deneyin.",
        status=502,
    )
