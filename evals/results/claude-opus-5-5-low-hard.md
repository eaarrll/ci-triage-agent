# Eval results: claude-opus-5-5-low-hard

Run on 2026-11-24 · model `claude-opus-5-5` · effort `low` · budget $0.50 and 12 turns per case · 8 fixtures × 3 repeats

| Metric | Value |
| --- | --- |
| Pass rate | 24/24 (100%) |
| Errors | 0 |
| Cost per case | mean $0.0351, median $0.0292 |
| Total cost | $0.8414 |
| Mean turns | 2.1 |
| Latency | p50 7.8 s, p95 11.1 s |

## By expected category

| Category | Passed | Rate |
| --- | --- | --- |
| code | 15/15 | 100% |
| dependency | 3/3 | 100% |
| cloud_auth | 3/3 | 100% |
| configuration | 3/3 | 100% |

## Cases

| | Fixture | Expected | Got | Cost | Turns | Tools | Failure reasons |
| --- | --- | --- | --- | --- | --- | --- | --- |
| ✅ | deploy-missing-entrypoint-tsconfig-include #1 | code / configuration | code (high) | $0.0503 | 2 | get_file_diff |  |
| ✅ | deploy-missing-entrypoint-tsconfig-include #2 | code / configuration | code (medium) | $0.0494 | 2 | get_file_diff |  |
| ✅ | deploy-missing-entrypoint-tsconfig-include #3 | code / configuration | code (high) | $0.0504 | 2 | get_file_diff |  |
| ✅ | job-timeout-leaked-interval #1 | code | code (high) | $0.0263 | 2 | get_file_diff |  |
| ✅ | job-timeout-leaked-interval #2 | code | code (high) | $0.0304 | 2 | get_file_diff ×2 |  |
| ✅ | job-timeout-leaked-interval #3 | code | code (medium) | $0.0272 | 2 | get_file_diff |  |
| ✅ | known-flaky-test-real-regression #1 | code | code (high) | $0.0249 | 2 | get_file_diff |  |
| ✅ | known-flaky-test-real-regression #2 | code | code (high) | $0.0243 | 2 | get_file_diff |  |
| ✅ | known-flaky-test-real-regression #3 | code | code (high) | $0.0243 | 2 | get_file_diff |  |
| ✅ | long-log-flags-file-renamed #1 | configuration / code | configuration (high) | $0.0598 | 2 | get_file_diff, search_log |  |
| ✅ | long-log-flags-file-renamed #2 | configuration / code | configuration (high) | $0.0592 | 2 | get_file_diff, search_log |  |
| ✅ | long-log-flags-file-renamed #3 | configuration / code | configuration (high) | $0.0641 | 3 | get_file_diff, search_log |  |
| ✅ | red-herring-proration-rounding #1 | code | code (high) | $0.0380 | 2 | get_file_diff |  |
| ✅ | red-herring-proration-rounding #2 | code | code (high) | $0.0372 | 2 | get_file_diff |  |
| ✅ | red-herring-proration-rounding #3 | code | code (high) | $0.0188 | 2 | get_file_diff |  |
| ✅ | s3-access-denied-kms-key #1 | cloud_auth / configuration | cloud_auth (medium) | $0.0299 | 2 | get_file_diff |  |
| ✅ | s3-access-denied-kms-key #2 | cloud_auth / configuration | cloud_auth (high) | $0.0377 | 3 | get_file_diff, read_file |  |
| ✅ | s3-access-denied-kms-key #3 | cloud_auth / configuration | cloud_auth (medium) | $0.0266 | 2 | get_file_diff ×2 |  |
| ✅ | two-failures-flake-and-type-error #1 | code | code (medium) | $0.0283 | 1 | none |  |
| ✅ | two-failures-flake-and-type-error #2 | code | code (high) | $0.0212 | 2 | get_file_diff |  |
| ✅ | two-failures-flake-and-type-error #3 | code | code (high) | $0.0184 | 2 | get_file_diff |  |
| ✅ | upstream-major-release-not-the-pr #1 | dependency | dependency (high) | $0.0406 | 3 | get_file_diff, search_log |  |
| ✅ | upstream-major-release-not-the-pr #2 | dependency | dependency (high) | $0.0257 | 2 | get_file_diff, search_log |  |
| ✅ | upstream-major-release-not-the-pr #3 | dependency | dependency (high) | $0.0285 | 3 | get_file_diff, search_log |  |
