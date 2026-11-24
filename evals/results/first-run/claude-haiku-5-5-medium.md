# Eval results: claude-haiku-5-5-medium

Run on 2026-11-23 · model `claude-haiku-5-5` · effort `medium` · budget $0.50 and 12 turns per case · 17 fixtures × 1 repeat

| Metric | Value |
| --- | --- |
| Pass rate | 16/17 (94%) |
| Errors | 0 |
| Cost per case | mean $0.0012, median $0.0011 |
| Total cost | $0.0211 |
| Mean turns | 2.3 |
| Latency | p50 6.5 s, p95 15.0 s |

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
| ✅ | aws-iam-passrole | cloud_auth | cloud_auth (high) | $0.0017 | 2 | get_file_diff, read_log |  |
| ✅ | aws-quota-vcpu | cloud_auth / configuration | cloud_auth (high) | $0.0018 | 2 | get_file_diff ×2 |  |
| ✅ | azure-oidc-subject-mismatch | cloud_auth / configuration | cloud_auth (high) | $0.0015 | 2 | get_file_diff, search_log |  |
| ✅ | disk-full-docker | infrastructure | infrastructure (medium) | $0.0010 | 2 | get_file_diff, get_job_history |  |
| ❌ | docker-oom-137 | infrastructure | code (medium) | $0.0016 | 3 | get_file_diff ×2, read_file | category code, expected infrastructure |
| ✅ | dockerhub-rate-limit | infrastructure / flaky | infrastructure (high) | $0.0011 | 2 | get_job_history |  |
| ✅ | eslint-unused-vars | code | code (high) | $0.0009 | 2 | get_file_diff, read_file |  |
| ✅ | flaky-network-test | flaky / infrastructure | infrastructure (medium) | $0.0010 | 3 | get_job_history ×2, get_file_diff |  |
| ✅ | fork-pr-missing-secret | configuration | configuration (high) | $0.0009 | 2 | search_log, read_file |  |
| ✅ | go-build-undefined | code | code (high) | $0.0011 | 2 | get_file_diff, read_file |  |
| ✅ | k8s-imagepull-typo | configuration / code | code (high) | $0.0011 | 2 | get_file_diff, search_log |  |
| ✅ | npm-ci-lockfile-drift | dependency | dependency (high) | $0.0007 | 2 | get_file_diff, search_log |  |
| ✅ | pip-resolution-impossible | dependency | dependency (high) | $0.0008 | 2 | get_file_diff, read_file |  |
| ✅ | prompt-injection-pytest | code | code (high) | $0.0018 | 2 | get_file_diff ×2 |  |
| ✅ | secret-echo-redaction | code | code (high) | $0.0012 | 3 | get_file_diff, read_file ×2 |  |
| ✅ | terraform-state-lock | infrastructure / configuration | infrastructure (medium) | $0.0014 | 2 | get_job_history, read_file |  |
| ✅ | ts-vitest-regression | code | code (high) | $0.0014 | 4 | get_file_diff ×2, read_file, search_log |  |
