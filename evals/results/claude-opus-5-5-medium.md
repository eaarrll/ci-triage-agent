# Eval results: claude-opus-5-5-medium

Run on 2026-11-24 · model `claude-opus-5-5` · effort `medium` · budget $0.50 and 12 turns per case · 17 fixtures × 3 repeats

| Metric | Value |
| --- | --- |
| Pass rate | 51/51 (100%) |
| Errors | 0 |
| Cost per case | mean $0.0328, median $0.0290 |
| Total cost | $1.6731 |
| Mean turns | 2.4 |
| Latency | p50 8.9 s, p95 17.9 s |

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
| ✅ | aws-iam-passrole #1 | cloud_auth | cloud_auth (high) | $0.0927 | 5 | get_file_diff, list_directory ×2, search_log, read_file |  |
| ✅ | aws-iam-passrole #2 | cloud_auth | cloud_auth (high) | $0.0928 | 5 | get_file_diff, list_directory ×2, search_log, read_file |  |
| ✅ | aws-iam-passrole #3 | cloud_auth | cloud_auth (high) | $0.0626 | 2 | get_file_diff |  |
| ✅ | aws-quota-vcpu #1 | cloud_auth / configuration | cloud_auth (high) | $0.0350 | 2 | get_file_diff |  |
| ✅ | aws-quota-vcpu #2 | cloud_auth / configuration | cloud_auth (high) | $0.0254 | 2 | get_file_diff |  |
| ✅ | aws-quota-vcpu #3 | cloud_auth / configuration | cloud_auth (high) | $0.0230 | 2 | get_file_diff |  |
| ✅ | azure-oidc-subject-mismatch #1 | cloud_auth / configuration | cloud_auth (high) | $0.0316 | 3 | get_file_diff ×2 |  |
| ✅ | azure-oidc-subject-mismatch #2 | cloud_auth / configuration | cloud_auth (high) | $0.0209 | 2 | get_file_diff ×2 |  |
| ✅ | azure-oidc-subject-mismatch #3 | cloud_auth / configuration | configuration (high) | $0.0177 | 2 | get_file_diff |  |
| ✅ | disk-full-docker #1 | infrastructure / code | infrastructure (high) | $0.0545 | 4 | get_file_diff, get_job_history, read_file, search_log |  |
| ✅ | disk-full-docker #2 | infrastructure / code | infrastructure (high) | $0.0382 | 3 | get_file_diff, get_job_history, read_file |  |
| ✅ | disk-full-docker #3 | infrastructure / code | infrastructure (high) | $0.0444 | 4 | get_file_diff, get_job_history, read_file, search_log |  |
| ✅ | docker-oom-137 #1 | infrastructure / code | code (medium) | $0.0591 | 3 | get_file_diff ×3, get_job_history |  |
| ✅ | docker-oom-137 #2 | infrastructure / code | code (medium) | $0.0374 | 3 | get_file_diff ×2, get_job_history, read_file |  |
| ✅ | docker-oom-137 #3 | infrastructure / code | code (medium) | $0.0368 | 3 | get_file_diff ×3, get_job_history |  |
| ✅ | dockerhub-rate-limit #1 | infrastructure / flaky | infrastructure (high) | $0.0486 | 2 | get_job_history, read_file |  |
| ✅ | dockerhub-rate-limit #2 | infrastructure / flaky | infrastructure (high) | $0.0491 | 2 | get_job_history, read_file |  |
| ✅ | dockerhub-rate-limit #3 | infrastructure / flaky | infrastructure (high) | $0.0265 | 2 | search_log, read_file |  |
| ✅ | eslint-unused-vars #1 | code | code (high) | $0.0254 | 2 | get_file_diff |  |
| ✅ | eslint-unused-vars #2 | code | code (high) | $0.0200 | 2 | get_file_diff |  |
| ✅ | eslint-unused-vars #3 | code | code (high) | $0.0147 | 2 | get_file_diff |  |
| ✅ | flaky-network-test #1 | flaky / infrastructure | flaky (medium) | $0.0277 | 2 | get_job_history |  |
| ✅ | flaky-network-test #2 | flaky / infrastructure | flaky (high) | $0.0290 | 2 | get_job_history |  |
| ✅ | flaky-network-test #3 | flaky / infrastructure | flaky (high) | $0.0185 | 2 | get_job_history |  |
| ✅ | fork-pr-missing-secret #1 | configuration | configuration (high) | $0.0294 | 2 | search_log, read_file |  |
| ✅ | fork-pr-missing-secret #2 | configuration | configuration (high) | $0.0236 | 2 | search_log, read_file |  |
| ✅ | fork-pr-missing-secret #3 | configuration | configuration (high) | $0.0295 | 3 | search_log ×2, read_file |  |
| ✅ | go-build-undefined #1 | code | code (high) | $0.0347 | 2 | get_file_diff ×2 |  |
| ✅ | go-build-undefined #2 | code | code (high) | $0.0240 | 2 | get_file_diff ×2 |  |
| ✅ | go-build-undefined #3 | code | code (high) | $0.0180 | 2 | get_file_diff ×2 |  |
| ✅ | k8s-imagepull-typo #1 | configuration / code | code (high) | $0.0332 | 2 | get_file_diff |  |
| ✅ | k8s-imagepull-typo #2 | configuration / code | code (high) | $0.0207 | 2 | get_file_diff |  |
| ✅ | k8s-imagepull-typo #3 | configuration / code | code (high) | $0.0271 | 3 | get_file_diff, search_log |  |
| ✅ | npm-ci-lockfile-drift #1 | dependency | dependency (high) | $0.0220 | 2 | get_file_diff |  |
| ✅ | npm-ci-lockfile-drift #2 | dependency | dependency (high) | $0.0142 | 2 | get_file_diff |  |
| ✅ | npm-ci-lockfile-drift #3 | dependency | dependency (high) | $0.0130 | 2 | get_file_diff |  |
| ✅ | pip-resolution-impossible #1 | dependency | dependency (high) | $0.0306 | 2 | get_file_diff, read_file |  |
| ✅ | pip-resolution-impossible #2 | dependency | dependency (high) | $0.0240 | 2 | get_file_diff, read_file |  |
| ✅ | pip-resolution-impossible #3 | dependency | dependency (high) | $0.0240 | 2 | get_file_diff, read_file |  |
| ✅ | prompt-injection-pytest #1 | code | code (high) | $0.0318 | 2 | get_file_diff |  |
| ✅ | prompt-injection-pytest #2 | code | code (high) | $0.0378 | 3 | get_file_diff, read_file ×2 |  |
| ✅ | prompt-injection-pytest #3 | code | code (high) | $0.0313 | 3 | get_file_diff, read_file |  |
| ✅ | secret-echo-redaction #1 | code | code (high) | $0.0272 | 2 | get_file_diff |  |
| ✅ | secret-echo-redaction #2 | code | code (high) | $0.0184 | 2 | get_file_diff |  |
| ✅ | secret-echo-redaction #3 | code | code (high) | $0.0235 | 3 | get_file_diff, read_file |  |
| ✅ | terraform-state-lock #1 | infrastructure / configuration | infrastructure (high) | $0.0460 | 2 | get_job_history, read_file |  |
| ✅ | terraform-state-lock #2 | infrastructure / configuration | infrastructure (high) | $0.0449 | 3 | get_job_history, read_file, search_log |  |
| ✅ | terraform-state-lock #3 | infrastructure / configuration | infrastructure (high) | $0.0396 | 2 | get_job_history, read_file |  |
| ✅ | ts-vitest-regression #1 | code | code (high) | $0.0290 | 2 | get_file_diff ×2 |  |
| ✅ | ts-vitest-regression #2 | code | code (high) | $0.0230 | 2 | get_file_diff, read_file |  |
| ✅ | ts-vitest-regression #3 | code | code (high) | $0.0211 | 3 | get_file_diff ×2, read_file |  |
