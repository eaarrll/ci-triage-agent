# Eval results: claude-haiku-5-5-medium-calibration

Run on 2026-11-24 · model `claude-haiku-5-5` · effort `medium` · budget $0.50 and 12 turns per case · 4 fixtures × 3 repeats

| Metric | Value |
| --- | --- |
| Pass rate | 12/12 (100%) |
| Errors | 0 |
| Cost per case | mean $0.0016, median $0.0016 |
| Total cost | $0.0195 |
| Mean turns | 3.3 |
| Latency | p50 10.4 s, p95 13.0 s |
| Evidence | 35/40 quotes verified (88%) · 0 misplaced · 5 not found · all verified in 10/12 cases |

## By expected category

| Category | Passed | Rate |
| --- | --- | --- |
| unknown | 12/12 | 100% |

## Cases

| | Fixture | Expected | Got | Cost | Turns | Tools | Evidence | Failure reasons |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| ✅ | calibration-job-never-started #1 | unknown / infrastructure / configuration | unknown (low) | $0.0021 | 3 | read_log, get_job_history, get_file_diff ×3 | 1/4 (3 not found) |  |
| ✅ | calibration-job-never-started #2 | unknown / infrastructure / configuration | unknown (low) | $0.0021 | 4 | get_file_diff ×3, get_job_history, list_directory | 1/3 (2 not found) |  |
| ✅ | calibration-job-never-started #3 | unknown / infrastructure / configuration | unknown (low) | $0.0021 | 3 | get_file_diff ×3, get_job_history, read_file | 3/3 |  |
| ✅ | calibration-new-latency-budget-test #1 | unknown / code / flaky / infrastructure | code (medium) | $0.0019 | 4 | get_file_diff ×2, get_job_history ×2 | 3/3 |  |
| ✅ | calibration-new-latency-budget-test #2 | unknown / code / flaky / infrastructure | flaky (medium) | $0.0016 | 2 | get_file_diff ×2 | 3/3 |  |
| ✅ | calibration-new-latency-budget-test #3 | unknown / code / flaky / infrastructure | code (medium) | $0.0015 | 4 | get_file_diff ×2, get_job_history ×2 | 3/3 |  |
| ✅ | calibration-sandbox-500-after-payload-change #1 | unknown / code / flaky / infrastructure | code (medium) | $0.0016 | 3 | get_file_diff ×2, get_job_history, search_log | 3/3 |  |
| ✅ | calibration-sandbox-500-after-payload-change #2 | unknown / code / flaky / infrastructure | code (medium) | $0.0013 | 2 | get_file_diff ×2, get_job_history | 3/3 |  |
| ✅ | calibration-sandbox-500-after-payload-change #3 | unknown / code / flaky / infrastructure | code (medium) | $0.0015 | 3 | get_file_diff ×2, search_log, get_job_history | 4/4 |  |
| ✅ | calibration-segfault-after-native-bump #1 | unknown / dependency / flaky / infrastructure / code | dependency (medium) | $0.0013 | 4 | get_file_diff ×2, search_log ×2, get_job_history | 3/3 |  |
| ✅ | calibration-segfault-after-native-bump #2 | unknown / dependency / flaky / infrastructure / code | dependency (medium) | $0.0015 | 4 | get_file_diff ×2, search_log ×2, get_job_history, read_log | 5/5 |  |
| ✅ | calibration-segfault-after-native-bump #3 | unknown / dependency / flaky / infrastructure / code | dependency (medium) | $0.0009 | 3 | get_file_diff ×2, search_log, get_job_history | 3/3 |  |
