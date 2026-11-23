"""Export a billing run to S3 as CSV for the ledger import."""

from __future__ import annotations

import csv
import io
import os
from collections.abc import Iterable

import boto3
from tenacity import retry, stop_after_attempt, wait_exponential

from billing_worker.invoice import Invoice

HEADER = ["customer_id", "currency", "subtotal", "tax", "total"]


def to_csv(invoices: Iterable[Invoice]) -> str:
    buffer = io.StringIO()
    writer = csv.writer(buffer, lineterminator="\n")
    writer.writerow(HEADER)
    for invoice in invoices:
        writer.writerow([invoice.customer_id, invoice.currency, invoice.subtotal, invoice.tax, invoice.total])
    return buffer.getvalue()


@retry(stop=stop_after_attempt(4), wait=wait_exponential(multiplier=0.5, max=8), reraise=True)
def export_run(run_id: str, invoices: Iterable[Invoice], *, bucket: str | None = None) -> str:
    key = f"billing-runs/{run_id}/invoices.csv"
    s3 = boto3.client("s3")
    s3.put_object(
        Bucket=bucket or os.environ["S3_EXPORT_BUCKET"],
        Key=key,
        Body=to_csv(invoices).encode(),
        ContentType="text/csv",
    )
    return key
