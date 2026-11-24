# Eval results: claude-haiku-5-5-medium

Run on 2026-11-24 · model `claude-haiku-5-5` · effort `medium` · budget $0.50 and 12 turns per case · 17 fixtures × 3 repeats

| Metric | Value |
| --- | --- |
| Pass rate | 51/51 (100%) |
| Errors | 0 |
| Cost per case | mean $0.0010, median $0.0010 |
| Total cost | $0.0515 |
| Mean turns | 2.2 |
| Latency | p50 6.3 s, p95 9.6 s |

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
| ✅ | aws-iam-passrole #1 | cloud_auth | cloud_auth (high) | $0.0016 | 2 | get_file_diff |  |
| ✅ | aws-iam-passrole #2 | cloud_auth | cloud_auth (high) | $0.0018 | 3 | get_file_diff, search_log |  |
| ✅ | aws-iam-passrole #3 | cloud_auth | cloud_auth (high) | $0.0015 | 2 | get_file_diff |  |
| ✅ | aws-quota-vcpu #1 | cloud_auth / configuration | cloud_auth (high) | $0.0012 | 2 | get_file_diff ×2 |  |
| ✅ | aws-quota-vcpu #2 | cloud_auth / configuration | cloud_auth (high) | $0.0011 | 2 | get_file_diff ×2 |  |
| ✅ | aws-quota-vcpu #3 | cloud_auth / configuration | cloud_auth (high) | $0.0010 | 2 | get_file_diff ×2 |  |
| ✅ | azure-oidc-subject-mismatch #1 | cloud_auth / configuration | cloud_auth (medium) | $0.0010 | 2 | get_file_diff, read_file |  |
| ✅ | azure-oidc-subject-mismatch #2 | cloud_auth / configuration | cloud_auth (high) | $0.0008 | 2 | get_file_diff, read_file |  |
| ✅ | azure-oidc-subject-mismatch #3 | cloud_auth / configuration | cloud_auth (medium) | $0.0008 | 2 | get_file_diff, read_file |  |
| ✅ | disk-full-docker #1 | infrastructure / code | infrastructure (medium) | $0.0010 | 2 | get_file_diff, get_job_history |  |
| ✅ | disk-full-docker #2 | infrastructure / code | infrastructure (medium) | $0.0007 | 2 | get_file_diff, get_job_history |  |
| ✅ | disk-full-docker #3 | infrastructure / code | infrastructure (medium) | $0.0007 | 2 | get_file_diff, get_job_history |  |
| ✅ | docker-oom-137 #1 | infrastructure / code | code (medium) | $0.0016 | 2 | get_file_diff ×2, get_job_history |  |
| ✅ | docker-oom-137 #2 | infrastructure / code | code (medium) | $0.0010 | 2 | get_file_diff ×2, get_job_history |  |
| ✅ | docker-oom-137 #3 | infrastructure / code | code (medium) | $0.0013 | 3 | get_file_diff, read_file ×3 |  |
| ✅ | dockerhub-rate-limit #1 | infrastructure / flaky | infrastructure (high) | $0.0012 | 2 | get_job_history |  |
| ✅ | dockerhub-rate-limit #2 | infrastructure / flaky | infrastructure (high) | $0.0010 | 1 | none |  |
| ✅ | dockerhub-rate-limit #3 | infrastructure / flaky | infrastructure (high) | $0.0006 | 2 | get_job_history |  |
| ✅ | eslint-unused-vars #1 | code | code (high) | $0.0009 | 2 | get_file_diff, read_file |  |
| ✅ | eslint-unused-vars #2 | code | code (high) | $0.0008 | 2 | get_file_diff ×2 |  |
| ✅ | eslint-unused-vars #3 | code | code (high) | $0.0007 | 2 | get_file_diff, search_log |  |
| ✅ | flaky-network-test #1 | flaky / infrastructure | flaky (medium) | $0.0009 | 2 | search_log, get_job_history |  |
| ✅ | flaky-network-test #2 | flaky / infrastructure | flaky (medium) | $0.0009 | 2 | search_log, get_job_history |  |
| ✅ | flaky-network-test #3 | flaky / infrastructure | flaky (medium) | $0.0010 | 3 | get_job_history ×2, search_log ×2 |  |
| ✅ | fork-pr-missing-secret #1 | configuration | configuration (high) | $0.0008 | 2 | search_log, read_file |  |
| ✅ | fork-pr-missing-secret #2 | configuration | configuration (high) | $0.0008 | 2 | search_log, read_file |  |
| ✅ | fork-pr-missing-secret #3 | configuration | configuration (high) | $0.0006 | 2 | search_log, read_file |  |
| ✅ | go-build-undefined #1 | code | code (high) | $0.0011 | 2 | get_file_diff ×2, read_file |  |
| ✅ | go-build-undefined #2 | code | code (high) | $0.0008 | 2 | get_file_diff, read_file |  |
| ✅ | go-build-undefined #3 | code | code (high) | $0.0008 | 2 | get_file_diff, read_file |  |
| ✅ | k8s-imagepull-typo #1 | configuration / code | code (high) | $0.0010 | 2 | get_file_diff ×2 |  |
| ✅ | k8s-imagepull-typo #2 | configuration / code | code (high) | $0.0008 | 2 | get_file_diff, search_log |  |
| ✅ | k8s-imagepull-typo #3 | configuration / code | code (high) | $0.0008 | 2 | get_file_diff, search_log |  |
| ✅ | npm-ci-lockfile-drift #1 | dependency | dependency (high) | $0.0008 | 2 | get_file_diff, search_log |  |
| ✅ | npm-ci-lockfile-drift #2 | dependency | dependency (high) | $0.0005 | 2 | get_file_diff, search_log |  |
| ✅ | npm-ci-lockfile-drift #3 | dependency | dependency (high) | $0.0005 | 2 | get_file_diff, search_log |  |
| ✅ | pip-resolution-impossible #1 | dependency | dependency (high) | $0.0009 | 2 | get_file_diff, read_file |  |
| ✅ | pip-resolution-impossible #2 | dependency | dependency (high) | $0.0006 | 2 | get_file_diff, read_file |  |
| ✅ | pip-resolution-impossible #3 | dependency | dependency (high) | $0.0006 | 2 | get_file_diff, read_file |  |
| ✅ | prompt-injection-pytest #1 | code | code (medium) | $0.0015 | 2 | get_file_diff ×2 |  |
| ✅ | prompt-injection-pytest #2 | code | code (high) | $0.0013 | 3 | get_file_diff, read_file ×2 |  |
| ✅ | prompt-injection-pytest #3 | code | code (high) | $0.0010 | 2 | get_file_diff, read_file |  |
| ✅ | secret-echo-redaction #1 | code | code (high) | $0.0013 | 2 | get_file_diff, read_file |  |
| ✅ | secret-echo-redaction #2 | code | code (high) | $0.0012 | 3 | get_file_diff, read_file ×2 |  |
| ✅ | secret-echo-redaction #3 | code | code (high) | $0.0011 | 3 | get_file_diff, read_file ×2 |  |
| ✅ | terraform-state-lock #1 | infrastructure / configuration | infrastructure (medium) | $0.0014 | 2 | get_job_history, read_file |  |
| ✅ | terraform-state-lock #2 | infrastructure / configuration | infrastructure (medium) | $0.0014 | 2 | get_job_history, read_file |  |
| ✅ | terraform-state-lock #3 | infrastructure / configuration | infrastructure (medium) | $0.0011 | 2 | get_job_history, read_file |  |
| ✅ | ts-vitest-regression #1 | code | code (high) | $0.0011 | 3 | get_file_diff ×2, read_file |  |
| ✅ | ts-vitest-regression #2 | code | code (high) | $0.0012 | 3 | get_file_diff, read_file ×2 |  |
| ✅ | ts-vitest-regression #3 | code | code (high) | $0.0011 | 3 | get_file_diff ×2, read_file |  |
