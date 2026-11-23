# orders-platform

The orders API and the AWS infrastructure it runs on.

| Path | Contents |
| --- | --- |
| `services/orders-api/` | FastAPI service, container image, tests |
| `infra/` | Terraform for the production ECS service, queues and load balancer rules |
| `infra/bootstrap/` | The GitHub Actions deploy role (applied by an account admin, not by CI) |

## Delivery

Pull requests run the tests and a `terraform plan` with the read-only `gha-plan` role.
A push to `main` runs `deploy.yml`: tests, image build and push to ECR, then
`terraform apply` with the `gha-deploy` role, then a smoke test against
`https://orders.example.com/healthz`.

## Local development

```sh
cd services/orders-api
python -m venv .venv && . .venv/bin/activate
pip install -r requirements.txt -r requirements-dev.txt
uvicorn app.main:app --reload --port 8080
```
