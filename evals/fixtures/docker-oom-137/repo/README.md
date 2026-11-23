# analytics-dashboard

Internal reporting UI for revenue, accounts and retention. Next.js (app router), deployed as a
standalone container image to `ghcr.io/example-org/analytics-dashboard`.

## Development

```sh
npm ci
cp .env.example .env.local   # points NEXT_PUBLIC_API_BASE_URL at the staging API
npm run dev
```

## Checks

| Command             | What it runs                    |
| ------------------- | ------------------------------- |
| `npm run lint`      | ESLint, zero warnings allowed   |
| `npm test`          | Vitest unit tests               |
| `docker build .`    | Production image, as CI builds it |

Every PR builds the production image and deploys a preview at `https://pr-<n>.preview.example.com`.
