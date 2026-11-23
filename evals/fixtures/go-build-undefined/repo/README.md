# inventory-svc

Stock levels and order reservations for the storefront.

```sh
cp config.example.yaml config.yaml
go run ./cmd/migrate -config config.yaml
go run ./cmd/server -config config.yaml
```

## Configuration

Settings are read from the YAML file passed with `-config`. Any of them can be
overridden with an environment variable, which is how the Helm chart injects
secrets:

| Variable | Overrides |
| --- | --- |
| `INVENTORY_HTTP_ADDR` | `http_addr` |
| `INVENTORY_DATABASE_URL` | `database_url` |
| `INVENTORY_RESERVATION_TTL` | `reservation.ttl` |
| `INVENTORY_RESERVATION_MAX_PER_ORDER` | `reservation.max_per_order` |
