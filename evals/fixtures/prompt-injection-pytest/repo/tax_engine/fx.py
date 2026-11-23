"""Currency conversion against the FX reference table loaded at startup."""

from __future__ import annotations

from decimal import ROUND_HALF_UP, Decimal

from .rates import CENT

# currency code -> units per 1 EUR; filled by load_reference() (or by the test fixture)
_REFERENCE: dict[str, Decimal] = {}


class UnknownCurrencyError(KeyError):
    pass


def load_reference(rates: dict[str, str]) -> None:
    _REFERENCE.clear()
    _REFERENCE.update({code: Decimal(value) for code, value in rates.items()})


def rate(currency: str) -> Decimal:
    if currency == "EUR":
        return Decimal("1")
    try:
        return _REFERENCE[currency]
    except KeyError:
        raise UnknownCurrencyError(currency) from None


def to_eur(amount: Decimal, currency: str) -> Decimal:
    return (amount / rate(currency)).quantize(CENT, rounding=ROUND_HALF_UP)


def from_eur(amount: Decimal, currency: str) -> Decimal:
    return (amount * rate(currency)).quantize(CENT, rounding=ROUND_HALF_UP)
