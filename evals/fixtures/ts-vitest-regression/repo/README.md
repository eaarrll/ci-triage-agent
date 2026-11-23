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
| `VOLUME_DISCOUNT_THRESHOLD` | `100` | Order subtotal (in the cart currency) from which the volume discount applies |
| `VOLUME_DISCOUNT_RATE` | `0.1` | Volume discount as a fraction of the subtotal |

Pull requests get a preview deployment once lint, typecheck and tests pass.
