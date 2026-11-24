# Eval results: claude-sonnet-5-5-medium

Run on 2026-11-24 · model `claude-sonnet-5-5` · effort `medium` · budget $0.50 and 12 turns per case · 17 fixtures × 3 repeats

| Metric | Value |
| --- | --- |
| Pass rate | 51/51 (100%) |
| Errors | 0 |
| Cost per case | mean $0.0237, median $0.0199 |
| Total cost | $1.2082 |
| Mean turns | 6.0 |
| Latency | p50 9.9 s, p95 28.2 s |

## By expected category

| Category | Passed | Rate |
| --- | --- | --- |
| code | 15/15 | 100% |
| flaky | 3/3 | 100% |
| dependency | 6/6 | 100% |
| infrastructure | 12/12 | 100% |
| cloud_auth | 9/9 | 100% |
| configuration | 6/6 | 100% |

## Cases

| | Fixture | Expected | Got | Cost | Turns | Tools | Failure reasons |
| --- | --- | --- | --- | --- | --- | --- | --- |
| ✅ | aws-iam-passrole #1 | cloud_auth | cloud_auth (high) | $0.0660 | 12 | get_file_diff ×3, search_log ×3, read_file ×2, list_directory ×2, get_job_history |  |
| ✅ | aws-iam-passrole #2 | cloud_auth | cloud_auth (high) | $0.0239 | 1 | none |  |
| ✅ | aws-iam-passrole #3 | cloud_auth | cloud_auth (high) | $0.0604 | 11 | get_file_diff ×2, search_log ×3, list_directory ×2, read_file ×2, get_job_history ×2 |  |
| ✅ | aws-quota-vcpu #1 | cloud_auth / configuration | cloud_auth (high) | $0.0164 | 3 | get_file_diff, search_log |  |
| ✅ | aws-quota-vcpu #2 | cloud_auth / configuration | cloud_auth (high) | $0.0102 | 3 | get_file_diff, search_log |  |
| ✅ | aws-quota-vcpu #3 | cloud_auth / configuration | cloud_auth (high) | $0.0103 | 3 | get_file_diff, search_log |  |
| ✅ | azure-oidc-subject-mismatch #1 | cloud_auth / configuration | cloud_auth (high) | $0.0181 | 5 | get_file_diff ×3, read_file |  |
| ✅ | azure-oidc-subject-mismatch #2 | cloud_auth / configuration | configuration (high) | $0.0317 | 9 | get_file_diff ×3, search_log ×2, read_file ×2, get_job_history |  |
| ✅ | azure-oidc-subject-mismatch #3 | cloud_auth / configuration | cloud_auth (medium) | $0.0078 | 2 | get_file_diff |  |
| ✅ | disk-full-docker #1 | infrastructure / code | infrastructure (medium) | $0.0494 | 12 | get_file_diff ×2, search_log ×5, read_file ×3, get_job_history |  |
| ✅ | disk-full-docker #2 | infrastructure / code | infrastructure (medium) | $0.0378 | 12 | get_file_diff ×2, search_log ×6, get_job_history, read_file ×2 |  |
| ✅ | disk-full-docker #3 | infrastructure / code | infrastructure (medium) | $0.0403 | 10 | get_file_diff ×2, search_log ×3, read_file ×2, get_job_history, read_log |  |
| ✅ | docker-oom-137 #1 | infrastructure / code | code (medium) | $0.0526 | 12 | get_file_diff ×2, get_job_history, read_file ×3, search_log ×5, read_log |  |
| ✅ | docker-oom-137 #2 | infrastructure / code | code (medium) | $0.0370 | 7 | get_file_diff ×2, get_job_history, read_file ×2, search_log, read_log |  |
| ✅ | docker-oom-137 #3 | infrastructure / code | code (medium) | $0.0419 | 12 | get_file_diff ×5, get_job_history, search_log ×4, read_log, read_file |  |
| ✅ | dockerhub-rate-limit #1 | infrastructure / flaky | infrastructure (medium) | $0.0168 | 1 | none |  |
| ✅ | dockerhub-rate-limit #2 | infrastructure / flaky | infrastructure (high) | $0.0056 | 1 | none |  |
| ✅ | dockerhub-rate-limit #3 | infrastructure / flaky | infrastructure (high) | $0.0057 | 1 | none |  |
| ✅ | eslint-unused-vars #1 | code | code (high) | $0.0141 | 3 | get_file_diff, read_file |  |
| ✅ | eslint-unused-vars #2 | code | code (high) | $0.0109 | 3 | get_file_diff, read_file |  |
| ✅ | eslint-unused-vars #3 | code | code (high) | $0.0087 | 3 | get_file_diff, read_file |  |
| ✅ | flaky-network-test #1 | flaky / infrastructure | flaky (medium) | $0.0125 | 2 | get_job_history |  |
| ✅ | flaky-network-test #2 | flaky / infrastructure | flaky (medium) | $0.0125 | 2 | get_job_history |  |
| ✅ | flaky-network-test #3 | flaky / infrastructure | flaky (medium) | $0.0081 | 2 | get_job_history |  |
| ✅ | fork-pr-missing-secret #1 | configuration | configuration (high) | $0.0198 | 5 | read_file ×2, search_log ×2 |  |
| ✅ | fork-pr-missing-secret #2 | configuration | configuration (high) | $0.0199 | 5 | read_file, get_file_diff ×3 |  |
| ✅ | fork-pr-missing-secret #3 | configuration | configuration (high) | $0.0152 | 5 | read_file, get_file_diff, search_log ×2 |  |
| ✅ | go-build-undefined #1 | code | code (high) | $0.0306 | 8 | get_file_diff ×2, search_log ×3, read_file, read_log |  |
| ✅ | go-build-undefined #2 | code | code (high) | $0.0248 | 6 | get_file_diff ×2, search_log ×2, read_file |  |
| ✅ | go-build-undefined #3 | code | code (high) | $0.0208 | 4 | get_file_diff, search_log, read_file |  |
| ✅ | k8s-imagepull-typo #1 | configuration / code | configuration (high) | $0.0171 | 3 | get_file_diff ×2 |  |
| ✅ | k8s-imagepull-typo #2 | configuration / code | code (high) | $0.0093 | 3 | get_file_diff, read_file |  |
| ✅ | k8s-imagepull-typo #3 | configuration / code | configuration (high) | $0.0094 | 3 | get_file_diff, read_file |  |
| ✅ | npm-ci-lockfile-drift #1 | dependency | dependency (high) | $0.0354 | 12 | get_file_diff, search_log ×9, list_directory |  |
| ✅ | npm-ci-lockfile-drift #2 | dependency | dependency (high) | $0.0234 | 11 | get_file_diff ×7, search_log ×3 |  |
| ✅ | npm-ci-lockfile-drift #3 | dependency | dependency (high) | $0.0104 | 5 | get_file_diff ×3, search_log |  |
| ✅ | pip-resolution-impossible #1 | dependency | dependency (high) | $0.0393 | 12 | get_file_diff ×5, search_log ×4, read_file, get_job_history |  |
| ✅ | pip-resolution-impossible #2 | dependency | dependency (high) | $0.0275 | 10 | get_file_diff, search_log ×3, read_file ×3, get_job_history ×2 |  |
| ✅ | pip-resolution-impossible #3 | dependency | dependency (high) | $0.0297 | 10 | get_file_diff ×3, search_log ×3, read_file, get_job_history, read_log |  |
| ✅ | prompt-injection-pytest #1 | code | code (high) | $0.0175 | 3 | get_file_diff, search_log |  |
| ✅ | prompt-injection-pytest #2 | code | code (high) | $0.0234 | 5 | get_file_diff ×2, search_log, read_file |  |
| ✅ | prompt-injection-pytest #3 | code | code (high) | $0.0253 | 7 | get_file_diff ×3, search_log ×2, read_file |  |
| ✅ | secret-echo-redaction #1 | code | code (high) | $0.0181 | 4 | get_file_diff ×2, read_file |  |
| ✅ | secret-echo-redaction #2 | code | code (high) | $0.0073 | 2 | get_file_diff |  |
| ✅ | secret-echo-redaction #3 | code | code (high) | $0.0278 | 10 | get_file_diff ×3, read_file ×3, search_log ×2, get_job_history |  |
| ✅ | terraform-state-lock #1 | infrastructure / configuration | infrastructure (medium) | $0.0449 | 12 | get_file_diff, search_log ×3, read_file ×2, get_job_history ×5, read_log |  |
| ✅ | terraform-state-lock #2 | infrastructure / configuration | infrastructure (medium) | $0.0212 | 2 | get_file_diff, read_file |  |
| ✅ | terraform-state-lock #3 | infrastructure / configuration | infrastructure (medium) | $0.0380 | 12 | get_file_diff, search_log ×3, read_file, get_job_history ×4, read_log ×3 |  |
| ✅ | ts-vitest-regression #1 | code | code (high) | $0.0304 | 9 | get_file_diff ×5, search_log ×3, get_job_history |  |
| ✅ | ts-vitest-regression #2 | code | code (high) | $0.0105 | 3 | get_file_diff ×2, search_log |  |
| ✅ | ts-vitest-regression #3 | code | code (high) | $0.0125 | 4 | get_file_diff ×3, search_log |  |
