# Eval results: claude-opus-5-5-medium-calibration

Run on 2026-11-24 · model `claude-opus-5-5` · effort `medium` · budget $0.50 and 12 turns per case · 4 fixtures × 3 repeats

| Metric | Value |
| --- | --- |
| Pass rate | 12/12 (100%) |
| Errors | 0 |
| Cost per case | mean $0.0584, median $0.0545 |
| Total cost | $0.7012 |
| Mean turns | 3.8 |
| Latency | p50 14.6 s, p95 21.3 s |
| Evidence | 48/48 quotes verified (100%) · 0 misplaced · 0 not found · all verified in 12/12 cases |

## By expected category

| Category | Passed | Rate |
| --- | --- | --- |
| unknown | 12/12 | 100% |

## Cases

| | Fixture | Expected | Got | Cost | Turns | Tools | Evidence | Failure reasons |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| ✅ | calibration-job-never-started #1 | unknown / infrastructure / configuration | unknown (low) | $0.0727 | 4 | get_file_diff ×3, get_job_history, list_directory, read_file | 3/3 |  |
| ✅ | calibration-job-never-started #2 | unknown / infrastructure / configuration | unknown (low) | $0.0861 | 5 | get_file_diff ×3, get_job_history, read_file ×3, list_directory | 3/3 |  |
| ✅ | calibration-job-never-started #3 | unknown / infrastructure / configuration | unknown (low) | $0.0912 | 5 | get_file_diff ×3, get_job_history, read_file ×3 | 4/4 |  |
| ✅ | calibration-new-latency-budget-test #1 | unknown / code / flaky / infrastructure | code (medium) | $0.0573 | 3 | get_file_diff ×2, get_job_history | 4/4 |  |
| ✅ | calibration-new-latency-budget-test #2 | unknown / code / flaky / infrastructure | code (medium) | $0.0363 | 3 | get_file_diff, read_file, get_job_history | 4/4 |  |
| ✅ | calibration-new-latency-budget-test #3 | unknown / code / flaky / infrastructure | code (medium) | $0.0318 | 3 | get_file_diff, read_file, get_job_history | 4/4 |  |
| ✅ | calibration-sandbox-500-after-payload-change #1 | unknown / code / flaky / infrastructure | code (medium) | $0.0517 | 3 | get_file_diff ×2, get_job_history, search_log | 4/4 |  |
| ✅ | calibration-sandbox-500-after-payload-change #2 | unknown / code / flaky / infrastructure | flaky (medium) | $0.0501 | 5 | get_file_diff ×2, get_job_history, search_log, list_directory, read_file | 4/4 |  |
| ✅ | calibration-sandbox-500-after-payload-change #3 | unknown / code / flaky / infrastructure | code (low) | $0.0464 | 3 | get_file_diff ×2, get_job_history, search_log | 5/5 |  |
| ✅ | calibration-segfault-after-native-bump #1 | unknown / dependency / flaky / infrastructure / code | dependency (medium) | $0.0705 | 4 | get_file_diff ×3, read_log, get_job_history, read_file | 4/4 |  |
| ✅ | calibration-segfault-after-native-bump #2 | unknown / dependency / flaky / infrastructure / code | dependency (medium) | $0.0586 | 3 | get_file_diff ×3, read_log, get_job_history | 5/5 |  |
| ✅ | calibration-segfault-after-native-bump #3 | unknown / dependency / flaky / infrastructure / code | dependency (medium) | $0.0486 | 4 | get_file_diff ×2, read_log, get_job_history | 4/4 |  |
