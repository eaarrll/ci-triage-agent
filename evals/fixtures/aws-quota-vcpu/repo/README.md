# batch-jobs

Nightly and month-end batch jobs, and the EC2 worker fleet that runs them.

* `jobs/` – job code. Each job reads work items from its SQS queue.
* `infra/` – Terraform for the worker fleet (launch template, Auto Scaling group, alarms)
  in the `batch-prod` account, `us-east-1`.

## Changing the fleet

Open a PR against `infra/`; the `infra` workflow posts a plan. Merging applies the saved
plan with the `gha-batch-deploy` role after approval of the `prod` environment.

Workers pull the job image and start polling their queue from user data, so new
capacity starts working as soon as the instances pass EC2 health checks.
