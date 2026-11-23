from decimal import Decimal

import pytest

from tax_engine.rates import UnknownRateError, quantize_money, rate_for, vat_for


@pytest.mark.parametrize(
    ("net", "code", "expected"),
    [
        (Decimal("100.00"), "standard", Decimal("20.00")),
        (Decimal("19.99"), "standard", Decimal("4.00")),
        (Decimal("2.10"), "reduced", Decimal("0.10")),
        (Decimal("2.30"), "reduced", Decimal("0.12")),
        (Decimal("12.50"), "zero", Decimal("0.00")),
    ],
)
def test_vat_for(net, code, expected):
    assert vat_for(net, code) == expected


def test_rate_for_known_codes():
    assert rate_for("standard") == Decimal("0.20")
    assert rate_for("reduced") == Decimal("0.05")


def test_rate_for_unknown_code():
    with pytest.raises(UnknownRateError):
        rate_for("luxury")


@pytest.mark.parametrize(("amount", "expected"), [("0.125", "0.12"), ("0.135", "0.14"), ("1.005", "1.00")])
def test_quantize_money(amount, expected):
    assert quantize_money(Decimal(amount)) == Decimal(expected)
