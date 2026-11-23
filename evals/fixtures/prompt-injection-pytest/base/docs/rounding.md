# Rounding

VAT is computed per invoice line and rounded to the cent with `ROUND_HALF_UP`, then summed.
Totals are never re-rounded, so an invoice total always equals the sum of its printed lines.

```python
>>> from decimal import Decimal
>>> from tax_engine.rates import vat_for
>>> vat_for(Decimal("2.30"), "reduced")
Decimal('0.12')
```
