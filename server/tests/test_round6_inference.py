from __future__ import annotations

import asyncio
import uuid

import pytest

from app import inference, rate_limit, repo
from app.inference import UpstreamError, run_inference
from app.models import AIContext, AIRequest


def _user(client):
    email = f"r6_{uuid.uuid4().hex[:10]}@example.com"
    client.post("/v1/auth/register", json={"email": email, "password": "secret12345"})
    row = repo.get_user_by_email(email)
    assert row is not None
    return row, int(row["id"])


def test_refund_deletes_only_the_consumed_row(client):
    # #8: refund eskiden 'en yeni satir'i siliyordu → ayni kullanicinin eszamanli BASARILI
    # isteginin satirini yanlislikla siliyordu. Artik try_consume eklenen rowid'i doner ve
    # refund yalnizca O satiri siler.
    user, uid = _user(client)
    repo.update_user(uid, {"rate_limit_per_hour": 10})
    user = repo.get_user_by_email(user["email"])

    a_allowed, _, _, a_rid = rate_limit.try_consume(user)
    b_allowed, _, _, b_rid = rate_limit.try_consume(user)
    assert a_allowed and b_allowed
    assert a_rid is not None and b_rid is not None and a_rid != b_rid
    assert rate_limit.usage_last_hour(uid) == 2

    # SADECE A'nin satirini iade et → B (sonraki/“basarili”) sayilmaya devam etmeli.
    rate_limit.refund(uid, a_rid)
    assert rate_limit.usage_last_hour(uid) == 1
    # Ayni satiri tekrar iade etmek no-op (zaten silinmis).
    rate_limit.refund(uid, a_rid)
    assert rate_limit.usage_last_hour(uid) == 1
    # Yanlis user_id ile iade B'yi silmemeli (savunma derinligi guard'i).
    rate_limit.refund(uid + 999_999, b_rid)
    assert rate_limit.usage_last_hour(uid) == 1


def _run(coro):
    return asyncio.get_event_loop().run_until_complete(coro) if False else asyncio.run(coro)


def test_malformed_200_raises_upstream(monkeypatch):
    # #17: vLLM gecerli zarf ama JSON-OLMAYAN content donerse (orn. max_tokens ile yarida
    # kesilmis), eskiden HTTP-200 + cop govde donup kota yanardi. Artik UpstreamError → 502
    # + kota iadesi (ai.py). Yapisal olmayan ciktiyi upstream hatasi say.
    class FakeResp:
        status_code = 200

        def json(self):
            return {"choices": [{"message": {"content": "bu json degil, duz metin"}}]}

    class FakeClient:
        def __init__(self, *a, **k):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, *a):
            return False

        async def post(self, *a, **k):
            return FakeResp()

    monkeypatch.setattr(inference.httpx, "AsyncClient", FakeClient)
    payload = AIRequest(text="merhaba", context=AIContext())
    with pytest.raises(UpstreamError):
        _run(run_inference(payload))


def test_valid_json_200_returns_object(monkeypatch):
    # Pozitif kontrol: gecerli JSON content → dict doner (regresyon guard'i fazla agresif degil).
    class FakeResp:
        status_code = 200

        def json(self):
            return {"choices": [{"message": {"content": '{"kind": "query", "answer": "ok"}'}}]}

    class FakeClient:
        def __init__(self, *a, **k):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, *a):
            return False

        async def post(self, *a, **k):
            return FakeResp()

    monkeypatch.setattr(inference.httpx, "AsyncClient", FakeClient)
    payload = AIRequest(text="merhaba", context=AIContext())
    out = _run(run_inference(payload))
    assert isinstance(out, dict) and out["kind"] == "query"
