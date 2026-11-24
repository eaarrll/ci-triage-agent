# Eval results: claude-haiku-5-5-medium-hard

Run on 2026-11-24 · model `claude-haiku-5-5` · effort `medium` · budget $0.50 and 12 turns per case · 8 fixtures × 3 repeats

| Metric | Value |
| --- | --- |
| Pass rate | 24/24 (100%) |
| Errors | 0 |
| Cost per case | mean $0.0016, median $0.0015 |
| Total cost | $0.0373 |
| Mean turns | 3.0 |
| Latency | p50 8.5 s, p95 11.6 s |
| Evidence | 76/79 quotes verified (96%) · 1 misplaced · 2 not found · all verified in 21/24 cases |

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
| ✅ | deploy-missing-entrypoint-tsconfig-include #1 | code / configuration | code (high) | $0.0022 | 4 | get_file_diff ×2, search_log ×3, read_file ×2 | 3/3 |  |
| ✅ | deploy-missing-entrypoint-tsconfig-include #2 | code / configuration | code (medium) | $0.0018 | 3 | get_file_diff, search_log ×2, read_file | 3/3 |  |
| ✅ | deploy-missing-entrypoint-tsconfig-include #3 | code / configuration | code (medium) | $0.0020 | 4 | get_file_diff, search_log ×2, read_file ×2 | 3/3 |  |
| ✅ | job-timeout-leaked-interval #1 | code | code (medium) | $0.0017 | 4 | get_file_diff ×4, get_job_history, read_file | 3/3 |  |
| ✅ | job-timeout-leaked-interval #2 | code | code (medium) | $0.0015 | 4 | get_file_diff ×6, read_file | 3/3 |  |
| ✅ | job-timeout-leaked-interval #3 | code | code (medium) | $0.0012 | 4 | get_file_diff ×5 | 3/3 |  |
| ✅ | known-flaky-test-real-regression #1 | code | code (high) | $0.0027 | 5 | get_file_diff ×2, get_job_history, search_log, read_file ×4 | 3/3 |  |
| ✅ | known-flaky-test-real-regression #2 | code | code (high) | $0.0017 | 3 | get_file_diff, get_job_history, read_file ×2 | 3/3 |  |
| ✅ | known-flaky-test-real-regression #3 | code | code (high) | $0.0013 | 2 | get_file_diff, get_job_history, read_file | 3/3 |  |
| ✅ | long-log-flags-file-renamed #1 | configuration / code | code (high) | $0.0018 | 2 | get_file_diff, search_log | 4/4 |  |
| ✅ | long-log-flags-file-renamed #2 | configuration / code | code (high) | $0.0015 | 3 | get_file_diff, search_log ×2, read_file | 4/4 |  |
| ✅ | long-log-flags-file-renamed #3 | configuration / code | configuration (high) | $0.0014 | 3 | get_file_diff, search_log ×2, read_file | 3/3 |  |
| ✅ | red-herring-proration-rounding #1 | code | code (high) | $0.0021 | 3 | get_file_diff, read_file ×2 | 3/4 (1 misplaced) |  |
| ✅ | red-herring-proration-rounding #2 | code | code (high) | $0.0016 | 2 | get_file_diff, read_file | 3/3 |  |
| ✅ | red-herring-proration-rounding #3 | code | code (high) | $0.0011 | 2 | get_file_diff, read_file | 3/3 |  |
| ✅ | s3-access-denied-kms-key #1 | cloud_auth / configuration | cloud_auth (medium) | $0.0014 | 2 | get_file_diff ×2, search_log | 2/3 (1 not found) |  |
| ✅ | s3-access-denied-kms-key #2 | cloud_auth / configuration | cloud_auth (medium) | $0.0011 | 2 | get_file_diff ×2, search_log | 2/2 |  |
| ✅ | s3-access-denied-kms-key #3 | cloud_auth / configuration | cloud_auth (medium) | $0.0012 | 2 | get_file_diff ×2, search_log | 3/4 (1 not found) |  |
| ✅ | two-failures-flake-and-type-error #1 | code | code (high) | $0.0014 | 3 | get_file_diff, get_job_history ×2 | 4/4 |  |
| ✅ | two-failures-flake-and-type-error #2 | code | code (high) | $0.0009 | 2 | get_file_diff, get_job_history | 4/4 |  |
| ✅ | two-failures-flake-and-type-error #3 | code | code (high) | $0.0011 | 3 | get_file_diff ×2, get_job_history ×2, read_file | 4/4 |  |
| ✅ | upstream-major-release-not-the-pr #1 | dependency | dependency (medium) | $0.0016 | 3 | get_file_diff, search_log, get_job_history, read_file | 3/3 |  |
| ✅ | upstream-major-release-not-the-pr #2 | dependency | dependency (medium) | $0.0015 | 3 | get_file_diff, search_log ×2, get_job_history, read_file | 4/4 |  |
| ✅ | upstream-major-release-not-the-pr #3 | dependency | dependency (high) | $0.0014 | 3 | get_file_diff, search_log, read_file ×2, get_job_history | 3/3 |  |
