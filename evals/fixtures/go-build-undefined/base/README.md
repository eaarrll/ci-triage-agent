# inventory-svc

Stock levels and order reservations for the storefront.

```sh
cp config.example.yaml config.yaml
go run ./cmd/migrate -config config.yaml
go run ./cmd/server -config config.yaml
```

## Configuration

Settings are read from the YAML file passed with `-config`; see
`config.example.yaml` for the available keys.
