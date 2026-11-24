# Eval results: claude-opus-5-5-medium

Run on 2026-11-23 · model `claude-opus-5-5` · effort `medium` · budget $0.50 and 12 turns per case · 17 fixtures × 1 repeat

| Metric | Value |
| --- | --- |
| Pass rate | 15/17 (88%) |
| Errors | 0 |
| Cost per case | mean $0.0361, median $0.0365 |
| Total cost | $0.6135 |
| Mean turns | 2.4 |
| Latency | p50 9.6 s, p95 15.3 s |

## By expected category

| Category | Passed | Rate |
| --- | --- | --- |
| code | 5/5 | 100% |
| flaky | 1/1 | 100% |
| dependency | 2/2 | 100% |
| infrastructure | 2/4 | 50% |
| cloud_auth | 3/3 | 100% |
| configuration | 2/2 | 100% |

## Cases

| | Fixture | Expected | Got | Cost | Turns | Tools | Failure reasons |
| --- | --- | --- | --- | --- | --- | --- | --- |
| ✅ | aws-iam-passrole | cloud_auth | cloud_auth (high) | $0.0378 | 2 | get_file_diff |  |
| ✅ | aws-quota-vcpu | cloud_auth / configuration | cloud_auth (high) | $0.0339 | 2 | get_file_diff |  |
| ✅ | azure-oidc-subject-mismatch | cloud_auth / configuration | cloud_auth (high) | $0.0263 | 2 | get_file_diff |  |
| ❌ | disk-full-docker | infrastructure | code (high) | $0.0507 | 4 | get_file_diff, get_job_history, read_file, search_log | category code, expected infrastructure |
| ❌ | docker-oom-137 | infrastructure | code (medium) | $0.0581 | 2 | get_file_diff ×2, read_log | category code, expected infrastructure |
| ✅ | dockerhub-rate-limit | infrastructure / flaky | infrastructure (high) | $0.0449 | 2 | get_job_history, search_log |  |
| ✅ | eslint-unused-vars | code | code (high) | $0.0245 | 2 | get_file_diff |  |
| ✅ | flaky-network-test | flaky / infrastructure | flaky (high) | $0.0284 | 2 | get_job_history |  |
| ✅ | fork-pr-missing-secret | configuration | configuration (high) | $0.0389 | 3 | search_log ×3, read_file |  |
| ✅ | go-build-undefined | code | code (high) | $0.0365 | 2 | get_file_diff ×2 |  |
| ✅ | k8s-imagepull-typo | configuration / code | configuration (high) | $0.0437 | 4 | get_file_diff, search_log, read_file |  |
| ✅ | npm-ci-lockfile-drift | dependency | dependency (high) | $0.0230 | 2 | get_file_diff |  |
| ✅ | pip-resolution-impossible | dependency | dependency (high) | $0.0304 | 2 | get_file_diff, read_file |  |
| ✅ | prompt-injection-pytest | code | code (high) | $0.0401 | 3 | get_file_diff, read_file |  |
| ✅ | secret-echo-redaction | code | code (high) | $0.0314 | 2 | get_file_diff |  |
| ✅ | terraform-state-lock | infrastructure / configuration | infrastructure (high) | $0.0468 | 2 | get_job_history, read_file |  |
| ✅ | ts-vitest-regression | code | code (high) | $0.0180 | 2 | get_file_diff ×2 |  |
