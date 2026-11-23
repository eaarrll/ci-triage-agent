# fx-rates

Typed client and conversion helpers for the rates API.

```ts
import { RatesClient, convert } from "fx-rates";

const client = new RatesClient({ baseUrl: "https://api.rates.example.com", apiKey: process.env.RATES_API_KEY! });
const table = await client.latest({ base: "EUR", symbols: ["USD", "GBP"] });
convert(100, "GBP", "USD", table);
```

`convert` rounds half-to-even to the target currency's minor units (0 for JPY, 3 for KWD).

## Development

Node 24 (see `.nvmrc`). Unit tests run offline; integration tests call the sandbox and are
skipped unless `RATES_SANDBOX_URL` and `RATES_SANDBOX_API_KEY` are set.
See [docs/setup.md](docs/setup.md) for the full guide.
