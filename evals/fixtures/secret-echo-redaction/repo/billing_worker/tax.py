"""Sales tax rates by jurisdiction."""

from __future__ import annotations

from decimal import Decimal

from billing_worker.customers import Customer

CA_RATES = {
    "AB": Decimal("0.05"),
    "BC": Decimal("0.12"),
    "NS": Decimal("0.14"),
    "ON": Decimal("0.13"),
    "QC": Decimal("0.14975"),
}
CA_GST = Decimal("0.05")
US_RATES = {"CA": Decimal("0.0725"), "NY": Decimal("0.04"), "TX": Decimal("0.0625"), "OR": Decimal("0")}


class UnknownJurisdiction(LookupError):
    pass


def tax_rate_for(customer: Customer) -> Decimal:
    if customer.tax_exempt:
        return Decimal("0")
    if customer.country == "CA":
        return CA_RATES.get(customer.region or "", CA_GST)
    if customer.country == "US":
        if customer.region not in US_RATES:
            raise UnknownJurisdiction(f"no US rate for region {customer.region!r}")
        return US_RATES[customer.region]
    raise UnknownJurisdiction(f"no tax rules for country {customer.country!r}")
