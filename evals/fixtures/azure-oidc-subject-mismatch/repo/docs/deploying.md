# Deploying payments-api

Every push to `main` runs `.github/workflows/deploy.yml`:

1. **Build & test** restores, builds and tests the solution.
2. **Deploy to production** waits for an approval from the `payments-oncall` team
   (GitHub environment `production`), then signs in to Azure with the
   `id-payments-api-deploy` managed identity (OpenID Connect, no stored secrets), pushes
   the image to `crpaymentsprod.azurecr.io` and rolls a new Container Apps revision.
3. **Smoke test** polls `https://payments.example.com/healthz`.

Approvers see the commit list and the build result on the run page before approving.
Deploys that wait for more than 24 hours expire; push again or re-run the workflow.

## Rolling back

Activate the previous revision and move traffic back to it:

```sh
az containerapp revision list -g rg-payments-prod -n ca-payments-api -o table
az containerapp ingress traffic set -g rg-payments-prod -n ca-payments-api \
  --revision-weight <previous-revision>=100
```

## Infrastructure

`infra/` (Bicep) is deployed by the platform team with
`az deployment group create -g rg-payments-prod -f infra/main.bicep`.
Ask in #platform-help for changes to the identity or its role assignments.
