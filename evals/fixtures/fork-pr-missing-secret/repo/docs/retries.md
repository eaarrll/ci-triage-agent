# Retries

The client retries requests that fail with 408, 429, 500, 502, 503 or 504, up to
`RetryPolicy.max_attempts` (default 4) attempts in total.

Between attempts it waits `base_delay * 2 ** (attempt - 1)` seconds, capped at `max_delay`, unless
the server sent `Retry-After`, which always wins. The computed delay is then spread by
`+/- jitter` (a fraction, default `0.2`) so many clients that failed at the same moment do not all
retry at the same moment. Set `jitter=0` for deterministic delays.

```python
from acme_sdk import Client, RetryPolicy

client = Client(api_key="...", retry=RetryPolicy(max_attempts=6, max_delay=30, jitter=0.1))
```
