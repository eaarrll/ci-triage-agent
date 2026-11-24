# Eval results: claude-sonnet-5-5-medium-hard

Run on 2026-11-24 · model `claude-sonnet-5-5` · effort `medium` · budget $0.50 and 12 turns per case · 8 fixtures × 3 repeats

| Metric | Value |
| --- | --- |
| Pass rate | 24/24 (100%) |
| Errors | 0 |
| Cost per case | mean $0.0253, median $0.0233 |
| Total cost | $0.6082 |
| Mean turns | 5.8 |
| Latency | p50 11.0 s, p95 22.3 s |

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
| ✅ | deploy-missing-entrypoint-tsconfig-include #1 | code / configuration | code (medium) | $0.0436 | 9 | get_file_diff ×2, search_log ×5, read_file ×2 |  |
| ✅ | deploy-missing-entrypoint-tsconfig-include #2 | code / configuration | code (medium) | $0.0472 | 10 | get_file_diff ×4, search_log ×3, read_file, read_log, get_job_history |  |
| ✅ | deploy-missing-entrypoint-tsconfig-include #3 | code / configuration | code (medium) | $0.0306 | 4 | get_file_diff, search_log ×2, read_file |  |
| ✅ | job-timeout-leaked-interval #1 | code | code (high) | $0.0278 | 7 | get_file_diff ×6, get_job_history |  |
| ✅ | job-timeout-leaked-interval #2 | code | code (high) | $0.0234 | 8 | get_file_diff ×6, read_file, search_log |  |
| ✅ | job-timeout-leaked-interval #3 | code | code (high) | $0.0186 | 7 | get_file_diff ×6, search_log |  |
| ✅ | known-flaky-test-real-regression #1 | code | code (high) | $0.0201 | 5 | get_file_diff ×3, search_log |  |
| ✅ | known-flaky-test-real-regression #2 | code | code (high) | $0.0154 | 5 | get_file_diff ×2, read_file, search_log |  |
| ✅ | known-flaky-test-real-regression #3 | code | code (high) | $0.0139 | 4 | get_file_diff ×2, read_file |  |
| ✅ | long-log-flags-file-renamed #1 | configuration / code | configuration (high) | $0.0470 | 7 | get_file_diff ×3, search_log ×3, read_file ×2 |  |
| ✅ | long-log-flags-file-renamed #2 | configuration / code | configuration (high) | $0.0255 | 5 | get_file_diff, search_log ×5, read_file |  |
| ✅ | long-log-flags-file-renamed #3 | configuration / code | configuration (high) | $0.0533 | 12 | get_file_diff ×2, search_log ×11, read_file ×2 |  |
| ✅ | red-herring-proration-rounding #1 | code | code (high) | $0.0233 | 4 | get_file_diff, search_log, get_job_history |  |
| ✅ | red-herring-proration-rounding #2 | code | code (high) | $0.0071 | 2 | get_file_diff |  |
| ✅ | red-herring-proration-rounding #3 | code | code (high) | $0.0234 | 7 | get_file_diff ×2, search_log ×2, read_file, get_job_history |  |
| ✅ | s3-access-denied-kms-key #1 | cloud_auth / configuration | cloud_auth (medium) | $0.0466 | 12 | get_file_diff ×7, search_log ×2, get_job_history, read_log, read_file |  |
| ✅ | s3-access-denied-kms-key #2 | cloud_auth / configuration | cloud_auth (medium) | $0.0306 | 10 | get_file_diff ×4, search_log ×4, get_job_history ×2 |  |
| ✅ | s3-access-denied-kms-key #3 | cloud_auth / configuration | cloud_auth (medium) | $0.0116 | 2 | get_file_diff, search_log |  |
| ✅ | two-failures-flake-and-type-error #1 | code | code (high) | $0.0180 | 2 | get_file_diff, get_job_history |  |
| ✅ | two-failures-flake-and-type-error #2 | code | code (high) | $0.0121 | 2 | get_file_diff, get_job_history |  |
| ✅ | two-failures-flake-and-type-error #3 | code | code (high) | $0.0123 | 3 | get_file_diff, get_job_history |  |
| ✅ | upstream-major-release-not-the-pr #1 | dependency | dependency (medium) | $0.0184 | 2 | get_file_diff, search_log |  |
| ✅ | upstream-major-release-not-the-pr #2 | dependency | dependency (medium) | $0.0260 | 8 | get_file_diff, search_log ×2, read_file, get_job_history ×3 |  |
| ✅ | upstream-major-release-not-the-pr #3 | dependency | dependency (medium) | $0.0124 | 3 | get_file_diff, search_log |  |
