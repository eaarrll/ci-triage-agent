# Retries

The client retries requests that fail with 408, 429, 500, 502, 503 or 504, up to
`RetryPolicy.max_attempts` (default 4) attempts in total.

Between attempts it waits `base_delay * 2 ** (attempt - 1)` seconds, capped at `max_delay`, unless
the server sent `Retry-After`, which always wins.

```python
from acme_sdk import Client, RetryPolicy

client = Client(api_key="...", retry=RetryPolicy(max_attempts=6, max_delay=30))
```
