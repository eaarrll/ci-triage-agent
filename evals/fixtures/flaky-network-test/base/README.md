# fx-rates

Typed client and conversion helpers for the rates API.

```ts
import { RatesClient, convert } from "fx-rates";

const client = new RatesClient({ baseUrl: "https://api.rates.example.com", apiKey: process.env.RATES_API_KEY! });
const table = await client.latest({ base: "EUR", symbols: ["USD", "GBP"] });
convert(100, "GBP", "USD", table);
```

## Development

See [docs/setup.md](docs/setup.md).
