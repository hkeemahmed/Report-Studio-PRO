"""In-process sliding window rate limiter. For multi-instance deployments swap for Redis (same interface)."""
import time
from collections import defaultdict, deque
from threading import Lock


class RateLimiter:
    def __init__(self):
        self._hits: dict[str, deque] = defaultdict(deque)
        self._lock = Lock()

    def allow(self, key: str, limit: int, window: float = 60.0) -> bool:
        if limit <= 0:
            return True
        now = time.monotonic()
        with self._lock:
            q = self._hits[key]
            while q and now - q[0] > window:
                q.popleft()
            if len(q) >= limit:
                return False
            q.append(now)
            return True

    def reset(self):
        with self._lock:
            self._hits.clear()


class RedisRateLimiter:
    """Fixed-window limiter shared by all API instances (used when RSP_REDIS_URL is set)."""

    def __init__(self, url: str):
        import redis
        self.r = redis.Redis.from_url(url)
        self.fallback = RateLimiter()

    def allow(self, key: str, limit: int, window: float = 60.0) -> bool:
        if limit <= 0:
            return True
        try:
            k = f"rsp:rl:{key}:{int(time.time() // window)}"
            n = self.r.incr(k)
            if n == 1:
                self.r.expire(k, int(window) + 1)
            return n <= limit
        except Exception:  # Redis down: degrade to per-process limiting instead of failing open
            return self.fallback.allow(key, limit, window)

    def reset(self):
        self.fallback.reset()


def _make():
    import os
    url = os.getenv("RSP_REDIS_URL", "")
    return RedisRateLimiter(url) if url else RateLimiter()


limiter = _make()
