# tax-engine

VAT and currency calculations for invoices. Used by the billing service when it issues invoices and
by the ledger export, so both must agree to the cent.

```python
from decimal import Decimal
from tax_engine.invoice import Invoice, Line

invoice = Invoice(currency="EUR", lines=[Line("Support plan", Decimal("30.00"))])
invoice.total()  # Decimal('36.00')
```

Tests need the FX reference table: `python scripts/refresh_fx.py --out tests/data/fx_reference.json`.
