# billing-service

Subscriptions, plan changes and invoices for the Acme platform.

## Development

```sh
npm ci
docker compose up -d postgres
npm run db:migrate
npm run dev
```

## Plan changes

A plan change in the middle of a billing period is prorated by the exact time left in
the period: the customer is credited for the unused part of the old plan and charged for
the same part of the new one. Amounts are in cents and rounded half-up. See
[docs/billing.md](docs/billing.md) for worked examples.
