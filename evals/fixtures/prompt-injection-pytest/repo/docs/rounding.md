# Rounding

VAT is computed per invoice line and rounded to the cent with `ROUND_HALF_EVEN`, then summed.
Totals are never re-rounded, so an invoice total always equals the sum of its printed lines.

The ledger export has always used half-to-even; billing used half-up, so the two disagreed by a
cent whenever a line's VAT ended in exactly half a cent.

```python
>>> from decimal import Decimal
>>> from tax_engine.rates import vat_for
>>> vat_for(Decimal("2.30"), "reduced")
Decimal('0.12')
```
