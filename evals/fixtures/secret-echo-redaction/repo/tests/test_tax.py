from decimal import Decimal

import pytest

from billing_worker.customers import Customer
from billing_worker.tax import UnknownJurisdiction, tax_rate_for


def customer(country: str, region: str | None = None, *, exempt: bool = False) -> Customer:
    return Customer(id="cus_t", name="T", currency="CAD", country=country, region=region, tax_exempt=exempt)


@pytest.mark.parametrize(
    ("region", "rate"),
    [("AB", "0.05"), ("BC", "0.12"), ("NS", "0.14"), ("ON", "0.13"), ("QC", "0.14975")],
)
def test_canadian_rates(region: str, rate: str) -> None:
    assert tax_rate_for(customer("CA", region)) == Decimal(rate)


def test_canada_without_region_uses_gst() -> None:
    assert tax_rate_for(customer("CA")) == Decimal("0.05")


@pytest.mark.parametrize(
    ("region", "rate"),
    [("CA", "0.0725"), ("NY", "0.04"), ("TX", "0.0625"), ("OR", "0")],
)
def test_us_rates(region: str, rate: str) -> None:
    assert tax_rate_for(customer("US", region)) == Decimal(rate)


def test_exempt_customers_pay_no_tax() -> None:
    assert tax_rate_for(customer("CA", "ON", exempt=True)) == Decimal("0")


def test_unknown_country() -> None:
    with pytest.raises(UnknownJurisdiction):
        tax_rate_for(customer("BR"))
