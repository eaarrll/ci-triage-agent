from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class Customer:
    id: str
    name: str
    currency: str
    country: str
    region: str | None = None
    tax_exempt: bool = False
