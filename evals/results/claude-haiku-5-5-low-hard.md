# Eval results: claude-haiku-5-5-low-hard

Run on 2026-11-24 · model `claude-haiku-5-5` · effort `low` · budget $0.50 and 12 turns per case · 8 fixtures × 3 repeats

| Metric | Value |
| --- | --- |
| Pass rate | 23/24 (96%) |
| Errors | 0 |
| Cost per case | mean $0.0012, median $0.0012 |
| Total cost | $0.0294 |
| Mean turns | 2.4 |
| Latency | p50 6.6 s, p95 10.3 s |

## By expected category

| Category | Passed | Rate |
| --- | --- | --- |
| code | 15/15 | 100% |
| dependency | 3/3 | 100% |
| cloud_auth | 3/3 | 100% |
| configuration | 2/3 | 67% |

## Cases

| | Fixture | Expected | Got | Cost | Turns | Tools | Failure reasons |
| --- | --- | --- | --- | --- | --- | --- | --- |
| ✅ | deploy-missing-entrypoint-tsconfig-include #1 | code / configuration | code (medium) | $0.0015 | 2 | get_file_diff, search_log |  |
| ✅ | deploy-missing-entrypoint-tsconfig-include #2 | code / configuration | code (medium) | $0.0016 | 2 | get_file_diff, search_log |  |
| ✅ | deploy-missing-entrypoint-tsconfig-include #3 | code / configuration | code (medium) | $0.0014 | 2 | get_file_diff, search_log |  |
| ✅ | job-timeout-leaked-interval #1 | code | code (medium) | $0.0013 | 4 | get_file_diff ×4, read_file |  |
| ✅ | job-timeout-leaked-interval #2 | code | code (medium) | $0.0013 | 4 | get_file_diff ×4, read_file |  |
| ✅ | job-timeout-leaked-interval #3 | code | code (medium) | $0.0018 | 5 | get_file_diff ×3, get_job_history, read_file ×2 |  |
| ✅ | known-flaky-test-real-regression #1 | code | code (medium) | $0.0012 | 2 | get_file_diff, get_job_history |  |
| ✅ | known-flaky-test-real-regression #2 | code | code (high) | $0.0012 | 2 | get_file_diff ×2, get_job_history |  |
| ✅ | known-flaky-test-real-regression #3 | code | code (high) | $0.0010 | 2 | get_file_diff, get_job_history |  |
| ✅ | long-log-flags-file-renamed #1 | configuration / code | configuration (high) | $0.0017 | 2 | get_file_diff, search_log |  |
| ✅ | long-log-flags-file-renamed #2 | configuration / code | code (high) | $0.0016 | 2 | get_file_diff, search_log |  |
| ❌ | long-log-flags-file-renamed #3 | configuration / code | code (high) | $0.0014 | 3 | get_file_diff, search_log ×3 | fix location not identified |
| ✅ | red-herring-proration-rounding #1 | code | code (high) | $0.0015 | 2 | get_file_diff, read_file |  |
| ✅ | red-herring-proration-rounding #2 | code | code (high) | $0.0014 | 2 | get_file_diff, read_file |  |
| ✅ | red-herring-proration-rounding #3 | code | code (high) | $0.0010 | 2 | get_file_diff, read_file |  |
| ✅ | s3-access-denied-kms-key #1 | cloud_auth / configuration | cloud_auth (medium) | $0.0010 | 2 | get_file_diff ×2 |  |
| ✅ | s3-access-denied-kms-key #2 | cloud_auth / configuration | cloud_auth (medium) | $0.0009 | 2 | get_file_diff ×2 |  |
| ✅ | s3-access-denied-kms-key #3 | cloud_auth / configuration | cloud_auth (medium) | $0.0008 | 2 | get_file_diff ×2 |  |
| ✅ | two-failures-flake-and-type-error #1 | code | code (high) | $0.0010 | 2 | get_file_diff, get_job_history |  |
| ✅ | two-failures-flake-and-type-error #2 | code | code (high) | $0.0010 | 3 | get_file_diff, get_job_history ×2 |  |
| ✅ | two-failures-flake-and-type-error #3 | code | code (high) | $0.0009 | 3 | get_file_diff, get_job_history ×2 |  |
| ✅ | upstream-major-release-not-the-pr #1 | dependency | dependency (medium) | $0.0012 | 2 | get_file_diff, search_log |  |
| ✅ | upstream-major-release-not-the-pr #2 | dependency | dependency (medium) | $0.0006 | 2 | get_file_diff, search_log |  |
| ✅ | upstream-major-release-not-the-pr #3 | dependency | dependency (medium) | $0.0009 | 2 | get_file_diff, search_log |  |
