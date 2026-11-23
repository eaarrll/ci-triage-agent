"""Entry point: turn a closed billing cycle into invoices and export them."""

from __future__ import annotations

from collections.abc import Iterable, Mapping, Sequence

import structlog

from billing_worker.customers import Customer
from billing_worker.invoice import Invoice, InvoiceLine, build_invoice
from billing_worker.s3_export import export_run
from billing_worker.tax import tax_rate_for

log = structlog.get_logger()


def run_cycle(
    run_id: str,
    customers: Iterable[Customer],
    usage: Mapping[str, Sequence[InvoiceLine]],
) -> list[Invoice]:
    invoices = []
    for customer in customers:
        lines = usage.get(customer.id, ())
        if not lines:
            log.info("skip_customer_without_usage", customer_id=customer.id, run_id=run_id)
            continue
        invoices.append(build_invoice(customer, lines, tax_rate=tax_rate_for(customer)))
    key = export_run(run_id, invoices)
    log.info("billing_run_exported", run_id=run_id, invoices=len(invoices), key=key)
    return invoices
