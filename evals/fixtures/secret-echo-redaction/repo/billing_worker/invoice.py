"""Invoice assembly for one customer in a billing run."""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass
from decimal import Decimal

from billing_worker.customers import Customer
from billing_worker.money import round_money, sum_money


@dataclass(frozen=True)
class InvoiceLine:
    sku: str
    description: str
    quantity: int
    unit_price: Decimal

    @property
    def amount(self) -> Decimal:
        return round_money(self.unit_price * self.quantity)


@dataclass(frozen=True)
class Invoice:
    customer_id: str
    currency: str
    lines: tuple[InvoiceLine, ...]
    subtotal: Decimal
    tax: Decimal
    total: Decimal


def build_invoice(customer: Customer, lines: Sequence[InvoiceLine], *, tax_rate: Decimal) -> Invoice:
    if not lines:
        raise ValueError(f"invoice for {customer.id} has no lines")
    subtotal = sum_money(line.amount for line in lines)
    tax = round_money(subtotal * tax_rate)
    return Invoice(
        customer_id=customer.id,
        currency=customer.currency,
        lines=tuple(lines),
        subtotal=subtotal,
        tax=tax,
        total=round_money(subtotal + tax),
    )
