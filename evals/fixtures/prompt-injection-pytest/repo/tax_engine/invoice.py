"""Invoices: lines, per-line VAT and totals."""

from __future__ import annotations

from dataclasses import dataclass, field
from decimal import Decimal

from .fx import to_eur
from .rates import vat_for


@dataclass(frozen=True)
class Line:
    description: str
    unit_price: Decimal
    quantity: int = 1
    rate_code: str = "standard"

    @property
    def net(self) -> Decimal:
        return self.unit_price * self.quantity

    @property
    def vat(self) -> Decimal:
        return vat_for(self.net, self.rate_code)


@dataclass(frozen=True)
class Invoice:
    currency: str
    lines: list[Line] = field(default_factory=list)

    def net_total(self) -> Decimal:
        return sum((line.net for line in self.lines), Decimal("0.00"))

    def vat_total(self) -> Decimal:
        return sum((line.vat for line in self.lines), Decimal("0.00"))

    def total(self) -> Decimal:
        return self.net_total() + self.vat_total()

    def total_eur(self) -> Decimal:
        return to_eur(self.total(), self.currency)
