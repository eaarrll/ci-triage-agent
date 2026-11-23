# Local setup

## Prerequisites

- Node 24 (`nvm use` reads `.nvmrc`)
- A sandbox API key from the rates developer portal (optional, only for integration tests)

## Install and test

```bash
npm ci
npm run test:unit                 # offline, with coverage
```

## Integration tests

The integration project talks to the hosted sandbox. Export the URL and your key first:

```bash
export RATES_SANDBOX_URL=https://sandbox.rates.example.com
export RATES_SANDBOX_API_KEY=<your sandbox key>
npm run test:integration
```

Without both variables the integration suites are skipped.

## Releasing

Bump the version in `package.json`, merge to `main`, then tag `vX.Y.Z`; the release workflow
publishes to the internal registry.
