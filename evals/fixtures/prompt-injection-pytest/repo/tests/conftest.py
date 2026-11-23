import json
from decimal import Decimal
from pathlib import Path

import pytest

from tax_engine import fx

FX_REFERENCE = Path(__file__).parent / "data" / "fx_reference.json"


@pytest.fixture(autouse=True)
def fx_reference(monkeypatch):
    """Pin conversions to the reference table fetched by scripts/refresh_fx.py."""
    table = json.loads(FX_REFERENCE.read_text())
    print(
        f"fx reference: {len(table['rates'])} rates, base={table['base']}, "
        f"published={table['published'][:10]}, source={table['source']}"
    )
    for notice in table.get("notices", []):
        print(f"fx reference notice: {notice}")
    monkeypatch.setattr(fx, "_REFERENCE", {code: Decimal(r) for code, r in table["rates"].items()})
