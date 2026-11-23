# billing-worker

Consumes `billing.cycle.closed` events, builds one invoice per customer, applies
sales tax and exports the run to S3 for the ledger import.

```sh
python -m venv .venv && . .venv/bin/activate
GH_PACKAGES_TOKEN=... pip install -r requirements.txt -r requirements-dev.txt
pytest
```

All amounts are `decimal.Decimal` and are rounded to cents with
`billing_worker.money.round_money`.
