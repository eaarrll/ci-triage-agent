# Changelog

## Unreleased

- Retry backoff now applies proportional jitter (`RetryPolicy.jitter`, default 0.2) so clients that
  failed together do not retry in lockstep.

## 2.4.0 - 2026-11-03

- Added `Client.projects.archive()`.
- `RateLimitError` now exposes `retry_after`.
