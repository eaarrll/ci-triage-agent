# Eval results: claude-sonnet-5-5-medium-calibration

Run on 2026-11-24 · model `claude-sonnet-5-5` · effort `medium` · budget $0.50 and 12 turns per case · 4 fixtures × 3 repeats

| Metric | Value |
| --- | --- |
| Pass rate | 12/12 (100%) |
| Errors | 0 |
| Cost per case | mean $0.0198, median $0.0162 |
| Total cost | $0.2376 |
| Mean turns | 3.6 |
| Latency | p50 8.9 s, p95 18.4 s |
| Evidence | 37/37 quotes verified (100%) · 0 misplaced · 0 not found · all verified in 12/12 cases |

## By expected category

| Category | Passed | Rate |
| --- | --- | --- |
| unknown | 12/12 | 100% |

## Cases

| | Fixture | Expected | Got | Cost | Turns | Tools | Evidence | Failure reasons |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| ✅ | calibration-job-never-started #1 | unknown / infrastructure / configuration | unknown (low) | $0.0296 | 3 | get_file_diff ×2, search_log, read_file | 2/2 |  |
| ✅ | calibration-job-never-started #2 | unknown / infrastructure / configuration | unknown (low) | $0.0452 | 9 | search_log, get_file_diff ×3, list_directory, read_file ×2, get_job_history ×2 | 2/2 |  |
| ✅ | calibration-job-never-started #3 | unknown / infrastructure / configuration | unknown (low) | $0.0352 | 5 | search_log, get_file_diff ×3, get_job_history | 3/3 |  |
| ✅ | calibration-new-latency-budget-test #1 | unknown / code / flaky / infrastructure | code (medium) | $0.0227 | 2 | get_file_diff, read_file | 3/3 |  |
| ✅ | calibration-new-latency-budget-test #2 | unknown / code / flaky / infrastructure | code (medium) | $0.0122 | 2 | get_file_diff, read_file | 3/3 |  |
| ✅ | calibration-new-latency-budget-test #3 | unknown / code / flaky / infrastructure | code (medium) | $0.0116 | 2 | get_file_diff, read_file | 3/3 |  |
| ✅ | calibration-sandbox-500-after-payload-change #1 | unknown / code / flaky / infrastructure | code (medium) | $0.0161 | 2 | get_file_diff ×2 | 4/4 |  |
| ✅ | calibration-sandbox-500-after-payload-change #2 | unknown / code / flaky / infrastructure | code (medium) | $0.0100 | 2 | get_file_diff ×2 | 4/4 |  |
| ✅ | calibration-sandbox-500-after-payload-change #3 | unknown / code / flaky / infrastructure | code (medium) | $0.0091 | 2 | get_file_diff ×2 | 3/3 |  |
| ✅ | calibration-segfault-after-native-bump #1 | unknown / dependency / flaky / infrastructure / code | dependency (medium) | $0.0175 | 4 | get_file_diff ×3, search_log | 3/3 |  |
| ✅ | calibration-segfault-after-native-bump #2 | unknown / dependency / flaky / infrastructure / code | dependency (medium) | $0.0121 | 4 | get_file_diff ×3, search_log | 4/4 |  |
| ✅ | calibration-segfault-after-native-bump #3 | unknown / dependency / flaky / infrastructure / code | dependency (medium) | $0.0163 | 6 | get_file_diff ×3, search_log ×3 | 3/3 |  |
