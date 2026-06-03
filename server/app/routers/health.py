from __future__ import annotations

import httpx
from fastapi import APIRouter

from .. import __version__
from ..config import settings

router = APIRouter(tags=["health"])


@router.get("/health")
async def health() -> dict:
    return {"status": "ok", "version": __version__}


@router.get("/health/upstream")
async def upstream_health() -> dict:
    """Upstream vLLM ulaşılabilir mi? (admin teşhis için, auth'suz, sadece bool.)"""
    url = settings.upstream_base_url.rstrip("/") + "/v1/models"
    try:
        async with httpx.AsyncClient(timeout=5) as client:
            resp = await client.get(url)
        return {"upstream": "ok" if resp.status_code < 500 else "error", "code": resp.status_code}
    except httpx.HTTPError:
        return {"upstream": "unreachable"}
