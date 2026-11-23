from decimal import Decimal

import pytest

from tax_engine.invoice import Invoice, Line
from tax_engine.rates import UnknownRateError


def test_line_net_multiplies_quantity():
    assert Line("Seat licence", Decimal("9.50"), quantity=4).net == Decimal("38.00")


def test_standard_rate_line_vat():
    assert Line("Consulting", Decimal("12.34")).vat == Decimal("2.47")


def test_zero_rated_line_has_no_vat():
    assert Line("Export shipment", Decimal("80.00"), rate_code="zero").vat == Decimal("0.00")


def test_unknown_rate_code_raises():
    with pytest.raises(UnknownRateError):
        Line("Gift card", Decimal("25.00"), rate_code="exempt").vat


def test_vat_total_sums_lines():
    invoice = Invoice(
        currency="EUR",
        lines=[Line("Hosting", Decimal("10.00")), Line("Backups", Decimal("19.99"))],
    )
    assert invoice.vat_total() == Decimal("6.00")


def test_invoice_total_mixed_rates():
    invoice = Invoice(
        currency="EUR",
        lines=[
            Line("Annual support plan", Decimal("30.00"), rate_code="standard"),
            Line("Printed handbook", Decimal("0.70"), quantity=3, rate_code="reduced"),
            Line("Courier", Decimal("4.29"), rate_code="zero"),
        ],
    )

    assert invoice.total() == Decimal("42.50")


def test_empty_invoice_totals_zero():
    assert Invoice(currency="EUR").total() == Decimal("0.00")


def test_total_eur_converts_from_invoice_currency():
    invoice = Invoice(currency="GBP", lines=[Line("Workshop", Decimal("100.00"))])
    assert invoice.total_eur() == (Decimal("120.00") / Decimal("0.8412")).quantize(Decimal("0.01"))
