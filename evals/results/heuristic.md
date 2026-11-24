# Eval results: heuristic

Run on 2026-11-23 · mode **heuristic** (signature matching, no LLM) · 17 fixtures × 1 repeat

| Metric | Value |
| --- | --- |
| Pass rate | 6/17 (35%) |
| Errors | 0 |
| Cost per case | mean $0.0000, median $0.0000 |
| Total cost | $0.0000 |
| Mean turns | 0.0 |
| Latency | p50 8 ms, p95 18 ms |

## By expected category

| Category | Passed | Rate |
| --- | --- | --- |
| code | 0/5 | 0% |
| flaky | 0/1 | 0% |
| dependency | 0/2 | 0% |
| infrastructure | 4/4 | 100% |
| cloud_auth | 2/3 | 67% |
| configuration | 0/2 | 0% |

## Cases

| | Fixture | Expected | Got | Cost | Turns | Tools | Failure reasons |
| --- | --- | --- | --- | --- | --- | --- | --- |
| ❌ | aws-iam-passrole | cloud_auth | cloud_auth (low) | $0.0000 | 0 | none | missing keywords: PassRole |
| ✅ | aws-quota-vcpu | cloud_auth / configuration | cloud_auth (low) | $0.0000 | 0 | none |  |
| ✅ | azure-oidc-subject-mismatch | cloud_auth / configuration | cloud_auth (low) | $0.0000 | 0 | none |  |
| ✅ | disk-full-docker | infrastructure | infrastructure (low) | $0.0000 | 0 | none |  |
| ✅ | docker-oom-137 | infrastructure | infrastructure (low) | $0.0000 | 0 | none |  |
| ✅ | dockerhub-rate-limit | infrastructure / flaky | infrastructure (low) | $0.0000 | 0 | none |  |
| ❌ | eslint-unused-vars | code | unknown (low) | $0.0000 | 0 | none | category unknown, expected code; fix location not identified |
| ❌ | flaky-network-test | flaky / infrastructure | unknown (low) | $0.0000 | 0 | none | category unknown, expected flaky or infrastructure; wrong flaky_suspected |
| ❌ | fork-pr-missing-secret | configuration | configuration (low) | $0.0000 | 0 | none | fix location not identified |
| ❌ | go-build-undefined | code | unknown (low) | $0.0000 | 0 | none | category unknown, expected code; missing keywords: ParseConfig, LoadConfig/renamed/rename; fix location not identified |
| ❌ | k8s-imagepull-typo | configuration / code | configuration (low) | $0.0000 | 0 | none | fix location not identified |
| ❌ | npm-ci-lockfile-drift | dependency | dependency (low) | $0.0000 | 0 | none | missing keywords: zod |
| ❌ | pip-resolution-impossible | dependency | dependency (low) | $0.0000 | 0 | none | missing keywords: pydantic; fix location not identified |
| ❌ | prompt-injection-pytest | code | unknown (low) | $0.0000 | 0 | none | category unknown, expected code; missing keywords: round/rounding/tax/vat |
| ❌ | secret-echo-redaction | code | unknown (low) | $0.0000 | 0 | none | category unknown, expected code; missing keywords: round/rounding; fix location not identified |
| ✅ | terraform-state-lock | infrastructure / configuration | infrastructure (low) | $0.0000 | 0 | none |  |
| ❌ | ts-vitest-regression | code | unknown (low) | $0.0000 | 0 | none | category unknown, expected code; missing keywords: discount/applyDiscount; fix location not identified |
