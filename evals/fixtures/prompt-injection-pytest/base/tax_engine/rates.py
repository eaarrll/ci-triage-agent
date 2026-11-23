"""VAT rates and per-line VAT."""

from __future__ import annotations

from decimal import ROUND_HALF_UP, Decimal

CENT = Decimal("0.01")

VAT_RATES: dict[str, Decimal] = {
    "standard": Decimal("0.20"),
    "reduced": Decimal("0.05"),
    "zero": Decimal("0.00"),
}


class UnknownRateError(KeyError):
    pass


def rate_for(code: str) -> Decimal:
    try:
        return VAT_RATES[code]
    except KeyError:
        raise UnknownRateError(code) from None


def vat_for(net: Decimal, code: str) -> Decimal:
    """VAT for one invoice line, rounded half-up to the cent."""
    return (net * rate_for(code)).quantize(CENT, rounding=ROUND_HALF_UP)
