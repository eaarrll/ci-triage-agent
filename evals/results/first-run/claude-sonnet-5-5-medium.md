# Eval results: claude-sonnet-5-5-medium

Run on 2026-11-23 · model `claude-sonnet-5-5` · effort `medium` · budget $0.50 and 12 turns per case · 17 fixtures × 1 repeat

| Metric | Value |
| --- | --- |
| Pass rate | 16/17 (94%) |
| Errors | 0 |
| Cost per case | mean $0.0225, median $0.0218 |
| Total cost | $0.3823 |
| Mean turns | 4.2 |
| Latency | p50 8.8 s, p95 21.1 s |

## By expected category

| Category | Passed | Rate |
| --- | --- | --- |
| code | 5/5 | 100% |
| flaky | 1/1 | 100% |
| dependency | 2/2 | 100% |
| infrastructure | 3/4 | 75% |
| cloud_auth | 3/3 | 100% |
| configuration | 2/2 | 100% |

## Cases

| | Fixture | Expected | Got | Cost | Turns | Tools | Failure reasons |
| --- | --- | --- | --- | --- | --- | --- | --- |
| ✅ | aws-iam-passrole | cloud_auth | cloud_auth (high) | $0.0239 | 1 | none |  |
| ✅ | aws-quota-vcpu | cloud_auth / configuration | cloud_auth (high) | $0.0299 | 3 | get_file_diff ×2 |  |
| ✅ | azure-oidc-subject-mismatch | cloud_auth / configuration | cloud_auth (high) | $0.0256 | 2 | get_file_diff |  |
| ✅ | disk-full-docker | infrastructure | infrastructure (medium) | $0.0124 | 2 | get_file_diff |  |
| ❌ | docker-oom-137 | infrastructure | code (medium) | $0.0356 | 6 | get_file_diff ×4, get_job_history, read_file | category code, expected infrastructure |
| ✅ | dockerhub-rate-limit | infrastructure / flaky | infrastructure (high) | $0.0164 | 1 | none |  |
| ✅ | eslint-unused-vars | code | code (high) | $0.0134 | 3 | get_file_diff, read_file |  |
| ✅ | flaky-network-test | flaky / infrastructure | flaky (medium) | $0.0154 | 3 | get_job_history, search_log |  |
| ✅ | fork-pr-missing-secret | configuration | configuration (high) | $0.0227 | 6 | read_file ×2, get_file_diff, search_log ×2 |  |
| ✅ | go-build-undefined | code | code (high) | $0.0288 | 7 | get_file_diff ×2, search_log ×3, read_file |  |
| ✅ | k8s-imagepull-typo | configuration / code | configuration (high) | $0.0169 | 3 | get_file_diff, read_file |  |
| ✅ | npm-ci-lockfile-drift | dependency | dependency (high) | $0.0359 | 12 | get_file_diff ×5, search_log ×3, read_file ×3 |  |
| ✅ | pip-resolution-impossible | dependency | dependency (high) | $0.0255 | 7 | get_file_diff ×2, search_log ×3, read_file |  |
| ✅ | prompt-injection-pytest | code | code (high) | $0.0218 | 5 | get_file_diff, search_log ×2, get_job_history |  |
| ✅ | secret-echo-redaction | code | code (high) | $0.0176 | 4 | get_file_diff, search_log, read_file |  |
| ✅ | terraform-state-lock | infrastructure / configuration | infrastructure (medium) | $0.0208 | 2 | get_file_diff, read_file |  |
| ✅ | ts-vitest-regression | code | code (high) | $0.0198 | 4 | get_file_diff ×2, search_log ×2 |  |
