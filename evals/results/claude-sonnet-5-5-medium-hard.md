# Eval results: claude-sonnet-5-5-medium-hard

Run on 2026-11-24 · model `claude-sonnet-5-5` · effort `medium` · budget $0.50 and 12 turns per case · 8 fixtures × 3 repeats

| Metric | Value |
| --- | --- |
| Pass rate | 24/24 (100%) |
| Errors | 0 |
| Cost per case | mean $0.0246, median $0.0181 |
| Total cost | $0.5907 |
| Mean turns | 5.4 |
| Latency | p50 9.5 s, p95 22.5 s |
| Evidence | 92/92 quotes verified (100%) · 0 misplaced · 0 not found · all verified in 24/24 cases |

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
| ✅ | deploy-missing-entrypoint-tsconfig-include #1 | code / configuration | code (medium) | $0.0315 | 4 | get_file_diff, search_log ×2, read_file | 3/3 |  |
| ✅ | deploy-missing-entrypoint-tsconfig-include #2 | code / configuration | code (high) | $0.0296 | 3 | get_file_diff, search_log ×2 | 3/3 |  |
| ✅ | deploy-missing-entrypoint-tsconfig-include #3 | code / configuration | code (medium) | $0.0431 | 9 | get_file_diff ×4, search_log ×2, read_file ×2, get_job_history | 4/4 |  |
| ✅ | job-timeout-leaked-interval #1 | code | code (high) | $0.0354 | 10 | get_file_diff ×8, search_log ×2 | 4/4 |  |
| ✅ | job-timeout-leaked-interval #2 | code | code (high) | $0.0174 | 2 | get_file_diff ×3 | 4/4 |  |
| ✅ | job-timeout-leaked-interval #3 | code | code (medium) | $0.0343 | 12 | get_file_diff ×7, read_file ×2, search_log ×3 | 4/4 |  |
| ✅ | known-flaky-test-real-regression #1 | code | code (high) | $0.0157 | 3 | get_file_diff, search_log | 4/4 |  |
| ✅ | known-flaky-test-real-regression #2 | code | code (high) | $0.0163 | 5 | get_file_diff ×3, read_file | 4/4 |  |
| ✅ | known-flaky-test-real-regression #3 | code | code (high) | $0.0171 | 6 | get_file_diff ×3, search_log, read_file | 3/3 |  |
| ✅ | long-log-flags-file-renamed #1 | configuration / code | configuration (high) | $0.0691 | 12 | get_file_diff ×2, search_log ×10, read_file ×3 | 5/5 |  |
| ✅ | long-log-flags-file-renamed #2 | configuration / code | configuration (high) | $0.0479 | 12 | get_file_diff ×3, search_log ×9, read_file ×3 | 5/5 |  |
| ✅ | long-log-flags-file-renamed #3 | configuration / code | configuration (high) | $0.0282 | 6 | get_file_diff, search_log ×6, read_file | 4/4 |  |
| ✅ | red-herring-proration-rounding #1 | code | code (high) | $0.0204 | 3 | get_file_diff, search_log | 3/3 |  |
| ✅ | red-herring-proration-rounding #2 | code | code (high) | $0.0246 | 7 | get_file_diff ×4, search_log, read_file | 4/4 |  |
| ✅ | red-herring-proration-rounding #3 | code | code (high) | $0.0093 | 3 | get_file_diff, search_log | 3/3 |  |
| ✅ | s3-access-denied-kms-key #1 | cloud_auth / configuration | cloud_auth (medium) | $0.0469 | 12 | get_file_diff ×4, search_log ×4, get_job_history, read_file ×3 | 4/4 |  |
| ✅ | s3-access-denied-kms-key #2 | cloud_auth / configuration | cloud_auth (medium) | $0.0176 | 4 | get_file_diff ×3, search_log | 4/4 |  |
| ✅ | s3-access-denied-kms-key #3 | cloud_auth / configuration | cloud_auth (medium) | $0.0125 | 4 | get_file_diff ×3, search_log | 3/3 |  |
| ✅ | two-failures-flake-and-type-error #1 | code | code (high) | $0.0179 | 2 | get_file_diff, get_job_history | 4/4 |  |
| ✅ | two-failures-flake-and-type-error #2 | code | code (high) | $0.0092 | 2 | get_file_diff, get_job_history | 4/4 |  |
| ✅ | two-failures-flake-and-type-error #3 | code | code (high) | $0.0091 | 2 | get_file_diff, get_job_history | 4/4 |  |
| ✅ | upstream-major-release-not-the-pr #1 | dependency | dependency (medium) | $0.0183 | 2 | get_file_diff, search_log | 4/4 |  |
| ✅ | upstream-major-release-not-the-pr #2 | dependency | dependency (medium) | $0.0095 | 2 | get_file_diff, search_log | 4/4 |  |
| ✅ | upstream-major-release-not-the-pr #3 | dependency | dependency (medium) | $0.0097 | 2 | get_file_diff, search_log | 4/4 |  |
