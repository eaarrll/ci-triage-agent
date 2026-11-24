from __future__ import annotations

from dataclasses import asdict, astuple, dataclass
from datetime import date
from decimal import Decimal


@dataclass(frozen=True)
class Row:
    date: date
    account: str
    category: str
    amount: Decimal
    currency: str

    def as_dict(self) -> dict[str, object]:
        return asdict(self)

    def as_tuple(self) -> tuple[object, ...]:
        return astuple(self)
