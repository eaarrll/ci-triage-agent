from decimal import Decimal

import boto3
import pytest
from moto import mock_aws

from billing_worker.customers import Customer
from billing_worker.invoice import InvoiceLine, build_invoice
from billing_worker.s3_export import HEADER, export_run, to_csv

CUSTOMER = Customer(id="cus_s3", name="S3 Test", currency="USD", country="US", region="OR")


@pytest.fixture
def invoices():
    line = InvoiceLine(sku="PLAN-PRO", description="Pro", quantity=1, unit_price=Decimal("99.00"))
    return [build_invoice(CUSTOMER, [line], tax_rate=Decimal("0"))]


@pytest.fixture
def bucket():
    with mock_aws():
        boto3.client("s3").create_bucket(Bucket="billing-exports-test")
        yield "billing-exports-test"


def test_csv_header(invoices) -> None:
    assert to_csv(invoices).splitlines()[0] == ",".join(HEADER)


def test_csv_row(invoices) -> None:
    assert to_csv(invoices).splitlines()[1] == "cus_s3,USD,99.00,0.00,99.00"


def test_csv_without_invoices() -> None:
    assert to_csv([]) == ",".join(HEADER) + "\n"


def test_export_returns_key(bucket, invoices) -> None:
    assert export_run("run_42", invoices) == "billing-runs/run_42/invoices.csv"


def test_export_writes_object(bucket, invoices) -> None:
    export_run("run_43", invoices)
    body = boto3.client("s3").get_object(Bucket=bucket, Key="billing-runs/run_43/invoices.csv")["Body"].read()
    assert body.decode().startswith("customer_id,")


def test_export_uses_explicit_bucket(bucket, invoices) -> None:
    assert export_run("run_44", invoices, bucket=bucket).endswith("invoices.csv")
