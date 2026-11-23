# Changelog

## Unreleased

- `round_money` no longer builds a Decimal context per call; invoice runs for large
  customers are ~18% faster.

## 3.8.0

- Export billing runs with a stable column order.
- Retry S3 uploads with exponential backoff.

## 3.7.2

- Fix GST/HST selection for customers in Canadian provinces without a region code.
