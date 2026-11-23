"""Money helpers shared by invoicing, tax and the ledger export."""

from __future__ import annotations

from collections.abc import Iterable
from decimal import ROUND_HALF_UP, Decimal

CENT = Decimal("0.01")
ZERO = Decimal("0.00")


def to_decimal(value: Decimal | int | str) -> Decimal:
    if isinstance(value, Decimal):
        return value
    return Decimal(value)


def round_money(amount: Decimal) -> Decimal:
    """Round to whole cents, half away from zero, the way the ledger and the PSP do."""
    return amount.quantize(CENT, rounding=ROUND_HALF_UP)


def sum_money(amounts: Iterable[Decimal]) -> Decimal:
    return round_money(sum(amounts, ZERO))


def format_money(amount: Decimal, currency: str) -> str:
    symbol = {"USD": "$", "CAD": "CA$", "EUR": "€", "GBP": "£"}.get(currency, f"{currency} ")
    sign = "-" if amount < 0 else ""
    return f"{sign}{symbol}{abs(amount):,.2f}"
