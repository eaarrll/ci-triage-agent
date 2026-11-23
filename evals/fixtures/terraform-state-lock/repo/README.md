# platform-infra

Terraform for the shared Azure platform: networking, AKS and storage for the
`staging` and `prod` environments.

## Layout

| Path | Contents |
| --- | --- |
| `envs/<env>/` | Root module per environment. State is kept in the `tfstate` container of that environment's state storage account. |
| `modules/` | Modules shared by the environments. |
| `docs/runbooks/` | Operational runbooks. |

## How changes ship

1. Open a pull request. `terraform.yml` validates the code, plans every environment and
   posts each plan as a PR comment.
2. Merge to `main`. The same workflow plans again and applies `staging`, then `prod`
   (the `production` environment requires an approval).
3. `drift.yml` plans every weekday night and opens an issue when an environment has drifted.

## Running locally

```sh
az login
cd envs/staging
terraform init
terraform plan
```

The CI identity is a user-assigned managed identity with federated credentials for this
repository; its IDs are stored as the `ARM_*` repository variables.
