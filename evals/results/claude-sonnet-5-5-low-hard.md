# Eval results: claude-sonnet-5-5-low-hard

Run on 2026-11-24 · model `claude-sonnet-5-5` · effort `low` · budget $0.50 and 12 turns per case · 8 fixtures × 3 repeats

| Metric | Value |
| --- | --- |
| Pass rate | 24/24 (100%) |
| Errors | 0 |
| Cost per case | mean $0.0302, median $0.0329 |
| Total cost | $0.7239 |
| Mean turns | 7.9 |
| Latency | p50 14.4 s, p95 29.0 s |

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
| ✅ | deploy-missing-entrypoint-tsconfig-include #1 | code / configuration | code (medium) | $0.0339 | 6 | get_file_diff ×2, search_log ×2, read_file |  |
| ✅ | deploy-missing-entrypoint-tsconfig-include #2 | code / configuration | code (medium) | $0.0320 | 5 | get_file_diff ×3, search_log |  |
| ✅ | deploy-missing-entrypoint-tsconfig-include #3 | code / configuration | code (medium) | $0.0358 | 7 | get_file_diff ×4, search_log ×2 |  |
| ✅ | job-timeout-leaked-interval #1 | code | code (medium) | $0.0418 | 12 | get_file_diff ×7, search_log ×2, read_file ×2, get_job_history |  |
| ✅ | job-timeout-leaked-interval #2 | code | code (medium) | $0.0386 | 12 | get_file_diff ×7, search_log ×4, read_file |  |
| ✅ | job-timeout-leaked-interval #3 | code | code (high) | $0.0191 | 6 | get_file_diff ×5, search_log |  |
| ✅ | known-flaky-test-real-regression #1 | code | code (high) | $0.0191 | 5 | get_file_diff ×3, search_log |  |
| ✅ | known-flaky-test-real-regression #2 | code | code (high) | $0.0155 | 5 | get_file_diff ×2, read_file, search_log |  |
| ✅ | known-flaky-test-real-regression #3 | code | code (high) | $0.0142 | 5 | get_file_diff ×2, read_file, search_log |  |
| ✅ | long-log-flags-file-renamed #1 | configuration / code | configuration (high) | $0.0615 | 12 | get_file_diff ×4, search_log ×5, read_file ×3 |  |
| ✅ | long-log-flags-file-renamed #2 | configuration / code | configuration (high) | $0.0421 | 12 | get_file_diff ×3, search_log ×8, read_file |  |
| ✅ | long-log-flags-file-renamed #3 | configuration / code | configuration (high) | $0.0420 | 12 | get_file_diff ×2, search_log ×6, read_file ×2, read_log, get_job_history |  |
| ✅ | red-herring-proration-rounding #1 | code | code (high) | $0.0416 | 9 | get_file_diff ×3, search_log ×2, read_file ×3 |  |
| ✅ | red-herring-proration-rounding #2 | code | code (high) | $0.0235 | 8 | get_file_diff ×5, search_log, read_file |  |
| ✅ | red-herring-proration-rounding #3 | code | code (high) | $0.0245 | 8 | get_file_diff ×5, search_log, read_file |  |
| ✅ | s3-access-denied-kms-key #1 | cloud_auth / configuration | cloud_auth (medium) | $0.0440 | 12 | get_file_diff ×5, search_log ×2, read_file ×3, get_job_history ×2 |  |
| ✅ | s3-access-denied-kms-key #2 | cloud_auth / configuration | cloud_auth (medium) | $0.0360 | 12 | get_file_diff ×6, search_log ×4, get_job_history, read_file |  |
| ✅ | s3-access-denied-kms-key #3 | cloud_auth / configuration | cloud_auth (medium) | $0.0365 | 12 | get_file_diff ×6, search_log ×3, read_file, get_job_history |  |
| ✅ | two-failures-flake-and-type-error #1 | code | code (high) | $0.0159 | 2 | get_file_diff |  |
| ✅ | two-failures-flake-and-type-error #2 | code | code (high) | $0.0189 | 3 | get_file_diff, get_job_history |  |
| ✅ | two-failures-flake-and-type-error #3 | code | code (high) | $0.0106 | 3 | get_file_diff, get_job_history |  |
| ✅ | upstream-major-release-not-the-pr #1 | dependency | dependency (medium) | $0.0273 | 6 | get_file_diff, search_log ×2, read_file, get_job_history |  |
| ✅ | upstream-major-release-not-the-pr #2 | dependency | dependency (medium) | $0.0381 | 12 | get_file_diff ×2, get_job_history ×2, search_log ×5, read_file ×2 |  |
| ✅ | upstream-major-release-not-the-pr #3 | dependency | dependency (medium) | $0.0115 | 3 | get_file_diff, search_log |  |
