# storefront-web

The Acme storefront single-page app. Every push to `main` deploys to staging:
`infra/` is applied with Terraform, the Vite build is synced to the assets bucket, and the
CloudFront distribution in front of it is invalidated.
