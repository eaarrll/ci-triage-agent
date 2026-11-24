# Eval results: claude-opus-5-5-medium-hard

Run on 2026-11-24 · model `claude-opus-5-5` · effort `medium` · budget $0.50 and 12 turns per case · 8 fixtures × 3 repeats

| Metric | Value |
| --- | --- |
| Pass rate | 24/24 (100%) |
| Errors | 0 |
| Cost per case | mean $0.0432, median $0.0423 |
| Total cost | $1.0356 |
| Mean turns | 2.8 |
| Latency | p50 10.5 s, p95 15.7 s |

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
| ✅ | deploy-missing-entrypoint-tsconfig-include #1 | code / configuration | code (high) | $0.0657 | 5 | get_file_diff, read_file ×2, search_log |  |
| ✅ | deploy-missing-entrypoint-tsconfig-include #2 | code / configuration | code (high) | $0.0565 | 3 | get_file_diff, read_file |  |
| ✅ | deploy-missing-entrypoint-tsconfig-include #3 | code / configuration | code (high) | $0.0570 | 3 | get_file_diff, read_file |  |
| ✅ | job-timeout-leaked-interval #1 | code | code (high) | $0.0358 | 2 | get_file_diff ×3 |  |
| ✅ | job-timeout-leaked-interval #2 | code | code (high) | $0.0330 | 2 | get_file_diff ×2 |  |
| ✅ | job-timeout-leaked-interval #3 | code | code (high) | $0.0266 | 2 | get_file_diff ×3 |  |
| ✅ | known-flaky-test-real-regression #1 | code | code (high) | $0.0297 | 2 | get_file_diff |  |
| ✅ | known-flaky-test-real-regression #2 | code | code (high) | $0.0271 | 2 | get_file_diff |  |
| ✅ | known-flaky-test-real-regression #3 | code | code (high) | $0.0203 | 2 | get_file_diff |  |
| ✅ | long-log-flags-file-renamed #1 | configuration / code | configuration (high) | $0.0751 | 3 | get_file_diff, search_log ×2, read_file |  |
| ✅ | long-log-flags-file-renamed #2 | configuration / code | configuration (high) | $0.0436 | 3 | get_file_diff, search_log ×2, read_file |  |
| ✅ | long-log-flags-file-renamed #3 | configuration / code | configuration (high) | $0.0402 | 3 | get_file_diff, search_log, read_file |  |
| ✅ | red-herring-proration-rounding #1 | code | code (high) | $0.0438 | 2 | get_file_diff |  |
| ✅ | red-herring-proration-rounding #2 | code | code (high) | $0.0387 | 2 | get_file_diff |  |
| ✅ | red-herring-proration-rounding #3 | code | code (high) | $0.0174 | 2 | get_file_diff |  |
| ✅ | s3-access-denied-kms-key #1 | cloud_auth / configuration | cloud_auth (high) | $0.0547 | 4 | get_file_diff ×2, search_log, list_directory, read_file |  |
| ✅ | s3-access-denied-kms-key #2 | cloud_auth / configuration | cloud_auth (high) | $0.0402 | 4 | get_file_diff ×2, list_directory, read_file |  |
| ✅ | s3-access-denied-kms-key #3 | cloud_auth / configuration | cloud_auth (high) | $0.0463 | 5 | get_file_diff ×2, search_log, list_directory, read_file |  |
| ✅ | two-failures-flake-and-type-error #1 | code | code (high) | $0.0435 | 2 | get_file_diff, get_job_history |  |
| ✅ | two-failures-flake-and-type-error #2 | code | code (high) | $0.0412 | 2 | get_file_diff, get_job_history |  |
| ✅ | two-failures-flake-and-type-error #3 | code | code (high) | $0.0291 | 2 | get_file_diff, get_job_history |  |
| ✅ | upstream-major-release-not-the-pr #1 | dependency | dependency (high) | $0.0527 | 3 | get_file_diff, search_log, get_job_history, read_file |  |
| ✅ | upstream-major-release-not-the-pr #2 | dependency | dependency (high) | $0.0587 | 4 | get_file_diff, search_log ×2, get_job_history, read_file |  |
| ✅ | upstream-major-release-not-the-pr #3 | dependency | dependency (high) | $0.0587 | 4 | get_file_diff, search_log ×3, get_job_history, read_file |  |
