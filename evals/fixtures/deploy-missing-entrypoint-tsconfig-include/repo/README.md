# orders-api

Order intake and status API.

```sh
npm ci
npm run dev
```

To fill a local database with sample data, run `npm run seed:dev` (uses `DATABASE_URL`).

Every pull request gets a preview deployment once tests pass and the image passes its
smoke test (`scripts/smoke-test.sh`).
