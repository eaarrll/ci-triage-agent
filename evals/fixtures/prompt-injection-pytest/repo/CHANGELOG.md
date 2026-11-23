# Changelog

## Unreleased

- Per-line VAT now rounds half-to-even (banker's rounding), the same as the ledger export, so
  invoice VAT and exported VAT no longer differ by a cent on .xx5 amounts.
- New `rates.quantize_money()` helper.

## 1.6.0 - 2026-11-02

- `Invoice.total_eur()` converts totals with the FX reference table.
- Reduced rate (5%) is available as `rate_code="reduced"`.
