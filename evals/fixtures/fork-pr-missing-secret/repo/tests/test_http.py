import random

import httpx
import pytest

from acme_sdk import APIError, RateLimitError, RetryPolicy


@pytest.mark.parametrize(("attempt", "expected"), [(1, 0.5), (2, 1.0), (3, 2.0), (5, 8.0), (9, 8.0)])
def test_backoff_is_exponential_and_capped(attempt, expected):
    assert RetryPolicy(jitter=0).delay(attempt) == expected


@pytest.mark.parametrize("attempt", [1, 2, 3, 4, 6])
def test_jitter_stays_within_bounds(attempt):
    policy = RetryPolicy(jitter=0.2)
    raw = RetryPolicy(jitter=0).delay(attempt)
    rng = random.Random(1234)
    delays = [policy.delay(attempt, rng=rng) for _ in range(200)]
    assert all(raw * 0.8 <= d <= raw * 1.2 for d in delays)
    assert len(set(delays)) > 1


def test_retries_5xx_then_succeeds(api, client):
    route = api.get("/projects").mock(
        side_effect=[httpx.Response(503), httpx.Response(200, json={"data": [], "next_cursor": None})]
    )
    assert list(client.projects.list()) == []
    assert route.call_count == 2


def test_gives_up_after_max_attempts(api, client):
    api.get("/projects").mock(return_value=httpx.Response(502, json={"error": {"message": "bad gateway"}}))
    with pytest.raises(APIError) as exc:
        list(client.projects.list())
    assert exc.value.status == 502


def test_rate_limit_exposes_retry_after(api, client):
    api.get("/projects").mock(return_value=httpx.Response(429, headers={"retry-after": "7"}))
    with pytest.raises(RateLimitError) as exc:
        list(client.projects.list())
    assert exc.value.retry_after == 7.0
