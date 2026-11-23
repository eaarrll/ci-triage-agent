from __future__ import annotations

from dataclasses import FrozenInstanceError, dataclass
from decimal import Decimal

import pytest

from billing_worker.customers import Customer
from billing_worker.invoice import InvoiceLine, build_invoice

CUSTOMER = Customer(id="cus_test_0001", name="Acme Test Co", currency="CAD", country="CA", region="AB")


def line(sku: str, unit_price: str, quantity: int = 1) -> InvoiceLine:
    return InvoiceLine(sku=sku, description=sku.title(), quantity=quantity, unit_price=Decimal(unit_price))


@dataclass(frozen=True)
class InvoiceCase:
    id: str
    lines: tuple[InvoiceLine, ...]
    tax_rate: Decimal
    expected_subtotal: Decimal
    expected_tax: Decimal
    expected_total: Decimal


CASES = [
    InvoiceCase(
        "starter",
        (line("PLAN-STARTER", "29.00"),),
        Decimal("0.05"),
        Decimal("29.00"),
        Decimal("1.45"),
        Decimal("30.45"),
    ),
    InvoiceCase(
        "ca-on-hst",
        (line("PLAN-PRO", "99.00"), line("SEAT-ADDON", "4.50", 2)),
        Decimal("0.13"),
        Decimal("108.00"),
        Decimal("14.04"),
        Decimal("122.04"),
    ),
    InvoiceCase(
        "ca-ab-gst",
        (line("PLAN-PRO", "99.00"), line("SEAT-ADDON", "4.50", 3)),
        Decimal("0.05"),
        Decimal("112.50"),
        Decimal("5.63"),
        Decimal("118.13"),
    ),
    InvoiceCase(
        "ca-qc",
        (line("PLAN-TEAM", "249.00"),),
        Decimal("0.14975"),
        Decimal("249.00"),
        Decimal("37.29"),
        Decimal("286.29"),
    ),
    InvoiceCase(
        "zero-rated",
        (line("PLAN-PRO", "99.00"),),
        Decimal("0"),
        Decimal("99.00"),
        Decimal("0.00"),
        Decimal("99.00"),
    ),
]


@pytest.mark.parametrize("case", CASES, ids=lambda c: c.id)
def test_invoice_totals(case: InvoiceCase) -> None:
    invoice = build_invoice(CUSTOMER, case.lines, tax_rate=case.tax_rate)

    assert invoice.subtotal == case.expected_subtotal
    assert invoice.tax == case.expected_tax
    assert invoice.total == case.expected_total


def test_line_amount_multiplies_quantity() -> None:
    assert line("SEAT-ADDON", "4.50", 7).amount == Decimal("31.50")


def test_build_invoice_rejects_empty_lines() -> None:
    with pytest.raises(ValueError, match="has no lines"):
        build_invoice(CUSTOMER, [], tax_rate=Decimal("0.05"))


def test_invoice_keeps_customer_currency() -> None:
    invoice = build_invoice(CUSTOMER, [line("PLAN-PRO", "99.00")], tax_rate=Decimal("0.05"))
    assert invoice.currency == "CAD"


def test_invoice_lines_are_a_tuple() -> None:
    invoice = build_invoice(CUSTOMER, [line("PLAN-PRO", "99.00")], tax_rate=Decimal("0.05"))
    assert isinstance(invoice.lines, tuple)


def test_invoice_is_immutable() -> None:
    invoice = build_invoice(CUSTOMER, [line("PLAN-PRO", "99.00")], tax_rate=Decimal("0.05"))
    with pytest.raises(FrozenInstanceError):
        invoice.total = Decimal("0")  # type: ignore[misc]
