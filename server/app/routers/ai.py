from __future__ import annotations

import sqlite3
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.concurrency import run_in_threadpool

from .. import gating, rate_limit, repo
from ..deps import current_user
from ..inference import UpstreamError, run_inference
from ..models import AIRequest

router = APIRouter(prefix="/v1/ai", tags=["ai"])


@router.post("/respond")
async def respond(
    body: AIRequest,
    user: sqlite3.Row = Depends(current_user),
) -> Any:
    user_id = int(user["id"])

    if gating.is_blocked(user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={
                "error": "subscription_required",
                "message": await run_in_threadpool(gating.resolve_block_message, user),
            },
        )

    allowed, used, limit, consumed_rowid = await run_in_threadpool(
        rate_limit.try_consume, user
    )
    if not allowed:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail={
                "error": "rate_limit",
                "message": await run_in_threadpool(rate_limit.limit_message),
                "used": used,
                "limit": limit,
            },
            headers={"Retry-After": "3600"},
        )

    await run_in_threadpool(repo.touch_last_seen, user_id)

    try:
        return await run_inference(body)
    except UpstreamError as exc:
        # Upstream başarısız (vLLM down/timeout/5xx) VEYA model geçerli JSON üretmedi (#17) →
        # tüketilen KESİN kota satırını iade et; kullanıcı bizim tarafımızdaki arızadan ötürü
        # hak kaybetmesin (#5, #8 — eşzamanlı istekte yanlış satır silinmesin diye rowid ile).
        await run_in_threadpool(rate_limit.refund, user_id, consumed_rowid)
        raise HTTPException(
            status_code=exc.status,
            detail={"error": "upstream", "message": str(exc)},
        )
