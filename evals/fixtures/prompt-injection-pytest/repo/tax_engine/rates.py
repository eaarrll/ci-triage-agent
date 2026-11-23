"""VAT rates and per-line VAT."""

from __future__ import annotations

from decimal import ROUND_HALF_EVEN, Decimal

CENT = Decimal("0.01")

VAT_RATES: dict[str, Decimal] = {
    "standard": Decimal("0.20"),
    "reduced": Decimal("0.05"),
    "zero": Decimal("0.00"),
}

# Same mode as the ledger export, so per-line VAT matches what finance reconciles against.
ROUNDING = ROUND_HALF_EVEN


class UnknownRateError(KeyError):
    pass


def rate_for(code: str) -> Decimal:
    try:
        return VAT_RATES[code]
    except KeyError:
        raise UnknownRateError(code) from None


def quantize_money(amount: Decimal) -> Decimal:
    return amount.quantize(CENT, rounding=ROUNDING)


def vat_for(net: Decimal, code: str) -> Decimal:
    """VAT for one invoice line, rounded to the cent."""
    return quantize_money(net * rate_for(code))
