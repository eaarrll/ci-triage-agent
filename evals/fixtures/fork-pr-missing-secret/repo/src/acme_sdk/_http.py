"""HTTP transport with retries for idempotent failures and rate limits."""

from __future__ import annotations

import random
import time
from dataclasses import dataclass
from typing import Any

import httpx

from .errors import APIError, RateLimitError

RETRYABLE_STATUS = frozenset({408, 429, 500, 502, 503, 504})


@dataclass(frozen=True)
class RetryPolicy:
    max_attempts: int = 4
    base_delay: float = 0.5
    max_delay: float = 8.0
    jitter: float = 0.2

    def delay(self, attempt: int, *, rng: random.Random | None = None) -> float:
        """Exponential backoff for the given 1-based attempt, +/- `jitter` as a fraction."""
        raw = min(self.max_delay, self.base_delay * 2 ** (attempt - 1))
        if not self.jitter:
            return raw
        spread = (rng or random).uniform(-self.jitter, self.jitter)
        return max(0.0, raw * (1 + spread))


class Transport:
    def __init__(
        self, base_url: str, api_key: str, *, retry: RetryPolicy | None = None, timeout: float = 30.0
    ) -> None:
        self._client = httpx.Client(
            base_url=base_url, timeout=timeout, headers={"authorization": f"Bearer {api_key}"}
        )
        self._retry = retry or RetryPolicy()

    def request(self, method: str, path: str, **kwargs: Any) -> httpx.Response:
        for attempt in range(1, self._retry.max_attempts + 1):
            response = self._client.request(method, path, **kwargs)
            if response.status_code not in RETRYABLE_STATUS or attempt == self._retry.max_attempts:
                break
            retry_after = response.headers.get("retry-after")
            time.sleep(float(retry_after) if retry_after else self._retry.delay(attempt))
        if response.status_code == 429:
            raise RateLimitError.from_response(response)
        if response.is_error:
            raise APIError.from_response(response)
        return response

    def close(self) -> None:
        self._client.close()
