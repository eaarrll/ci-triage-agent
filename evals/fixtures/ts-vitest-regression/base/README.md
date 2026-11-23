# shop-api

Pricing and order quoting API for the storefront.

## Development

```sh
npm ci
cp .env.example .env
npm run dev
```

`npm test` runs the unit tests, `npm run lint` and `npm run typecheck` run the static checks.

## Configuration

| Variable | Default | Description |
| --- | --- | --- |
| `PORT` | `8080` | HTTP port |
| `LOG_LEVEL` | `info` | `debug`, `info`, `warn` or `error` |

Orders of 100.00 or more get a 10% volume discount.

Pull requests get a preview deployment once lint, typecheck and tests pass.
