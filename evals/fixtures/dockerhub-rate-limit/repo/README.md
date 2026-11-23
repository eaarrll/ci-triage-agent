# orders-api

HTTP API for customer orders (Go, Postgres, Redis).

```bash
make up        # postgres:16 + redis:7 via docker compose
make migrate
make test
```

`GET /customers/{customerID}/orders?limit=50&cursor=...` returns `{ "orders": [...], "next_cursor": "..." }`.
