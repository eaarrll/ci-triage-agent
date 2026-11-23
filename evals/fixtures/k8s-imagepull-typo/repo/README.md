# web-frontend

Storefront web app (React + a small Express server). Images are built by `release.yml` when a
`vX.Y.Z` tag is pushed and published as `ghcr.io/example-org/web:<tag>`.

## Releasing

1. Bump `version` in `package.json` and add a `CHANGELOG.md` entry.
2. Tag the merge commit (`git tag v1.2.3 && git push origin v1.2.3`) and wait for the Release workflow.
3. Point `k8s/deployment.yaml` at the new tag. Merging that to `main` deploys to staging.
