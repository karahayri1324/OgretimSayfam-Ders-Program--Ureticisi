from __future__ import annotations

import threading
import time


_WINDOW_SEC = 900
_MAX_FAILS = 8
_MAX_KEYS = 10_000
_SWEEP_INTERVAL = 60.0
_lock = threading.Lock()
_fails: dict[str, list[float]] = {}
_last_sweep = 0.0


def _prune(ts: list[float], now: float) -> list[float]:
    return [t for t in ts if now - t < _WINDOW_SEC]


def _sweep(now: float) -> None:
    """Süresi dolmuş/boş anahtarları sil (çağıran _lock'u tutuyor olmalı)."""
    dead = [k for k, ts in _fails.items() if not _prune(ts, now)]
    for k in dead:
        _fails.pop(k, None)


def _maybe_sweep(now: float) -> None:
    global _last_sweep
    if now - _last_sweep >= _SWEEP_INTERVAL:
        _sweep(now)
        _last_sweep = now


def is_locked(key: str) -> bool:
    k = key.lower()
    with _lock:
        now = time.monotonic()
        _maybe_sweep(now)
        lst = _prune(_fails.get(k, []), now)
        if lst:
            _fails[k] = lst
        elif k in _fails:
            del _fails[k]
        return len(lst) >= _MAX_FAILS


def record_failure(key: str) -> None:
    k = key.lower()
    with _lock:
        now = time.monotonic()
        _maybe_sweep(now)
        lst = _prune(_fails.get(k, []), now)
        lst.append(now)
        _fails[k] = lst
        if len(_fails) > _MAX_KEYS:
            overflow = len(_fails) - _MAX_KEYS
            for old_k in sorted(_fails, key=lambda kk: _fails[kk][-1])[:overflow]:
                _fails.pop(old_k, None)


def clear(key: str) -> None:
    with _lock:
        _fails.pop(key.lower(), None)
