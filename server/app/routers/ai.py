from __future__ import annotations

import sqlite3
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status

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
                "message": gating.resolve_block_message(user),
            },
        )

    allowed, used, limit = rate_limit.check(user)
    if not allowed:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail={
                "error": "rate_limit",
                "message": rate_limit.limit_message(),
                "used": used,
                "limit": limit,
            },
            headers={"Retry-After": "3600"},
        )
    rate_limit.record(user_id)

    repo.touch_last_seen(user_id)

    try:
        return await run_inference(body)
    except UpstreamError as exc:
        raise HTTPException(
            status_code=exc.status,
            detail={"error": "upstream", "message": str(exc)},
        )
