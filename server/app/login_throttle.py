from __future__ import annotations

import threading
import time


_WINDOW_SEC = 900
_MAX_FAILS = 8
_lock = threading.Lock()
_fails: dict[str, list[float]] = {}


def _prune(ts: list[float], now: float) -> list[float]:
    return [t for t in ts if now - t < _WINDOW_SEC]


def is_locked(key: str) -> bool:
    k = key.lower()
    with _lock:
        now = time.monotonic()
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
        lst = _prune(_fails.get(k, []), now)
        lst.append(now)
        _fails[k] = lst


def clear(key: str) -> None:
    with _lock:
        _fails.pop(key.lower(), None)
