from decimal import Decimal

import pytest

from billing_worker import worker
from billing_worker.customers import Customer
from billing_worker.invoice import InvoiceLine

PRO = InvoiceLine(sku="PLAN-PRO", description="Pro", quantity=1, unit_price=Decimal("99.00"))
ON = Customer(id="cus_on", name="On", currency="CAD", country="CA", region="ON")
OR = Customer(id="cus_or", name="Or", currency="USD", country="US", region="OR")
BR = Customer(id="cus_br", name="Br", currency="BRL", country="BR")


@pytest.fixture
def exported(mocker):
    return mocker.patch.object(worker, "export_run", return_value="billing-runs/r/invoices.csv")


def test_one_invoice_per_customer(exported) -> None:
    assert len(worker.run_cycle("r", [ON, OR], {"cus_on": [PRO], "cus_or": [PRO]})) == 2


def test_skips_customers_without_usage(exported) -> None:
    assert [i.customer_id for i in worker.run_cycle("r", [ON, OR], {"cus_or": [PRO]})] == ["cus_or"]


def test_applies_the_customer_tax_rate(exported) -> None:
    (invoice,) = worker.run_cycle("r", [ON], {"cus_on": [PRO]})
    assert invoice.tax == Decimal("12.87")


def test_us_customer_in_oregon_pays_no_tax(exported) -> None:
    (invoice,) = worker.run_cycle("r", [OR], {"cus_or": [PRO]})
    assert invoice.total == Decimal("99.00")


def test_exports_every_invoice(exported) -> None:
    worker.run_cycle("r", [ON, OR], {"cus_on": [PRO], "cus_or": [PRO]})
    assert len(exported.call_args.args[1]) == 2


def test_exports_under_the_run_id(exported) -> None:
    worker.run_cycle("run_77", [ON], {"cus_on": [PRO]})
    assert exported.call_args.args[0] == "run_77"


def test_empty_cycle_still_exports(exported) -> None:
    assert worker.run_cycle("r", [], {}) == []
    exported.assert_called_once()


def test_unknown_jurisdiction_aborts_the_run(exported) -> None:
    with pytest.raises(LookupError):
        worker.run_cycle("r", [BR], {"cus_br": [PRO]})
