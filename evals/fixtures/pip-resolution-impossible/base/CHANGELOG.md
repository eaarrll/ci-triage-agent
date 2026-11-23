# Changelog

## 0.14.0

- Add device-level velocity features (`txn_count_1h`, `txn_count_24h`).
- Write feature vectors in batches of `ML_FEATURES_BATCH_SIZE` rows.

## 0.13.2

- Fix timezone handling for `computed_at` on DST boundaries.
