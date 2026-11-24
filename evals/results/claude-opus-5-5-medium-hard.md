# Eval results: claude-opus-5-5-medium-hard

Run on 2026-11-24 · model `claude-opus-5-5` · effort `medium` · budget $0.50 and 12 turns per case · 8 fixtures × 3 repeats

| Metric | Value |
| --- | --- |
| Pass rate | 24/24 (100%) |
| Errors | 0 |
| Cost per case | mean $0.0428, median $0.0410 |
| Total cost | $1.0272 |
| Mean turns | 2.9 |
| Latency | p50 10.1 s, p95 13.8 s |
| Evidence | 98/98 quotes verified (100%) · 0 misplaced · 0 not found · all verified in 24/24 cases |

## By expected category

| Category | Passed | Rate |
| --- | --- | --- |
| code | 15/15 | 100% |
| dependency | 3/3 | 100% |
| cloud_auth | 3/3 | 100% |
| configuration | 3/3 | 100% |

## Cases

| | Fixture | Expected | Got | Cost | Turns | Tools | Evidence | Failure reasons |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| ✅ | deploy-missing-entrypoint-tsconfig-include #1 | code / configuration | code (high) | $0.0568 | 3 | get_file_diff, read_file | 3/3 |  |
| ✅ | deploy-missing-entrypoint-tsconfig-include #2 | code / configuration | code (high) | $0.0575 | 3 | get_file_diff, read_file | 3/3 |  |
| ✅ | deploy-missing-entrypoint-tsconfig-include #3 | code / configuration | code (high) | $0.0660 | 5 | get_file_diff, read_file ×2, search_log | 3/3 |  |
| ✅ | job-timeout-leaked-interval #1 | code | code (high) | $0.0332 | 2 | get_file_diff ×2 | 5/5 |  |
| ✅ | job-timeout-leaked-interval #2 | code | code (high) | $0.0364 | 2 | read_file ×3 | 5/5 |  |
| ✅ | job-timeout-leaked-interval #3 | code | code (high) | $0.0286 | 2 | get_file_diff ×3 | 5/5 |  |
| ✅ | known-flaky-test-real-regression #1 | code | code (high) | $0.0307 | 2 | get_file_diff | 3/3 |  |
| ✅ | known-flaky-test-real-regression #2 | code | code (high) | $0.0249 | 2 | get_file_diff | 3/3 |  |
| ✅ | known-flaky-test-real-regression #3 | code | code (high) | $0.0203 | 2 | get_file_diff | 3/3 |  |
| ✅ | long-log-flags-file-renamed #1 | configuration / code | configuration (high) | $0.0769 | 4 | get_file_diff, search_log ×2, read_file | 4/4 |  |
| ✅ | long-log-flags-file-renamed #2 | configuration / code | configuration (high) | $0.0424 | 3 | get_file_diff, search_log ×2, read_file | 4/4 |  |
| ✅ | long-log-flags-file-renamed #3 | configuration / code | configuration (high) | $0.0395 | 3 | get_file_diff, search_log, read_file | 4/4 |  |
| ✅ | red-herring-proration-rounding #1 | code | code (high) | $0.0375 | 2 | get_file_diff | 4/4 |  |
| ✅ | red-herring-proration-rounding #2 | code | code (high) | $0.0425 | 2 | get_file_diff | 4/4 |  |
| ✅ | red-herring-proration-rounding #3 | code | code (high) | $0.0220 | 2 | get_file_diff | 5/5 |  |
| ✅ | s3-access-denied-kms-key #1 | cloud_auth / configuration | cloud_auth (high) | $0.0535 | 4 | get_file_diff ×2, search_log, list_directory, read_file | 5/5 |  |
| ✅ | s3-access-denied-kms-key #2 | cloud_auth / configuration | cloud_auth (high) | $0.0394 | 4 | get_file_diff ×2, list_directory, read_file | 4/4 |  |
| ✅ | s3-access-denied-kms-key #3 | cloud_auth / configuration | cloud_auth (high) | $0.0450 | 4 | get_file_diff ×2, search_log, list_directory, read_file | 5/5 |  |
| ✅ | two-failures-flake-and-type-error #1 | code | code (high) | $0.0489 | 3 | get_file_diff, get_job_history, read_file | 5/5 |  |
| ✅ | two-failures-flake-and-type-error #2 | code | code (high) | $0.0291 | 2 | get_file_diff, get_job_history | 5/5 |  |
| ✅ | two-failures-flake-and-type-error #3 | code | code (high) | $0.0289 | 2 | get_file_diff, get_job_history | 5/5 |  |
| ✅ | upstream-major-release-not-the-pr #1 | dependency | dependency (high) | $0.0614 | 4 | get_file_diff, search_log ×2, get_job_history, read_file | 4/4 |  |
| ✅ | upstream-major-release-not-the-pr #2 | dependency | dependency (high) | $0.0624 | 4 | get_file_diff, search_log ×3, get_job_history, read_file | 3/3 |  |
| ✅ | upstream-major-release-not-the-pr #3 | dependency | dependency (high) | $0.0434 | 3 | get_file_diff, search_log, get_job_history, read_file | 4/4 |  |
