# Eval results: heuristic

Run on 2026-11-24 · mode **heuristic** (signature matching, no LLM) · 25 fixtures × 1 repeat

| Metric | Value |
| --- | --- |
| Pass rate | 4/25 (16%) |
| Errors | 0 |
| Cost per case | mean $0.0000, median $0.0000 |
| Total cost | $0.0000 |
| Mean turns | 0.0 |
| Latency | p50 5 ms, p95 13 ms |
| Evidence | 67/67 quotes verified (100%) · 0 misplaced · 0 not found · all verified in 25/25 cases |

## By expected category

| Category | Passed | Rate |
| --- | --- | --- |
| code | 0/10 | 0% |
| flaky | 0/1 | 0% |
| dependency | 0/3 | 0% |
| infrastructure | 2/4 | 50% |
| cloud_auth | 2/4 | 50% |
| configuration | 0/3 | 0% |

## Cases

| | Fixture | Expected | Got | Cost | Turns | Tools | Evidence | Failure reasons |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| ❌ | aws-iam-passrole | cloud_auth | cloud_auth (low) | $0.0000 | 0 | none | 2/2 | missing keywords: PassRole |
| ✅ | aws-quota-vcpu | cloud_auth / configuration | cloud_auth (low) | $0.0000 | 0 | none | 3/3 |  |
| ✅ | azure-oidc-subject-mismatch | cloud_auth / configuration | cloud_auth (low) | $0.0000 | 0 | none | 2/2 |  |
| ❌ | deploy-missing-entrypoint-tsconfig-include | code / configuration | infrastructure (low) | $0.0000 | 0 | none | 3/3 | category infrastructure, expected code or configuration; missing keywords: tsconfig, rootDir/dist/src/common root/common source directory; fix location not identified |
| ❌ | disk-full-docker | infrastructure / code | infrastructure (low) | $0.0000 | 0 | none | 3/3 | missing keywords: tensorrt/onnx/requirements-gpu |
| ❌ | docker-oom-137 | infrastructure / code | infrastructure (low) | $0.0000 | 0 | none | 3/3 | missing keywords: plotly |
| ✅ | dockerhub-rate-limit | infrastructure / flaky | infrastructure (low) | $0.0000 | 0 | none | 3/3 |  |
| ❌ | eslint-unused-vars | code | unknown (low) | $0.0000 | 0 | none | 2/2 | category unknown, expected code; fix location not identified |
| ❌ | flaky-network-test | flaky / infrastructure | unknown (low) | $0.0000 | 0 | none | 3/3 | category unknown, expected flaky or infrastructure; wrong flaky_suspected |
| ❌ | fork-pr-missing-secret | configuration | configuration (low) | $0.0000 | 0 | none | 1/1 | fix location not identified |
| ❌ | go-build-undefined | code | unknown (low) | $0.0000 | 0 | none | 1/1 | category unknown, expected code; missing keywords: ParseConfig, LoadConfig/renamed/rename; fix location not identified |
| ❌ | job-timeout-leaked-interval | code | infrastructure (low) | $0.0000 | 0 | none | 2/2 | category infrastructure, expected code; missing keywords: setInterval/interval/MetricsBatcher/batcher/timer, did not exit/open handle/event loop/never exit/keeps the process/keep the process/keeps node/hang/alive/detectOpenHandles |
| ❌ | k8s-imagepull-typo | configuration / code | configuration (low) | $0.0000 | 0 | none | 3/3 | fix location not identified |
| ❌ | known-flaky-test-real-regression | code | unknown (low) | $0.0000 | 0 | none | 3/3 | category unknown, expected code; missing keywords: time.Second/Millisecond/milliseconds/250s/250 seconds/seconds instead; fix location not identified |
| ❌ | long-log-flags-file-renamed | configuration / code | unknown (low) | $0.0000 | 0 | none | 3/3 | category unknown, expected configuration or code; missing keywords: FEATURE_FLAGS_FILE/flags.test.yaml, renam/not found/no longer exist/does not exist/doesn't exist/missing/moved; fix location not identified |
| ❌ | npm-ci-lockfile-drift | dependency | dependency (low) | $0.0000 | 0 | none | 3/3 | missing keywords: zod |
| ❌ | pip-resolution-impossible | dependency | dependency (low) | $0.0000 | 0 | none | 3/3 | missing keywords: pydantic; fix location not identified |
| ❌ | prompt-injection-pytest | code | unknown (low) | $0.0000 | 0 | none | 3/3 | category unknown, expected code; missing keywords: round/rounding/tax/vat |
| ❌ | red-herring-proration-rounding | code | unknown (low) | $0.0000 | 0 | none | 3/3 | category unknown, expected code; missing keywords: proration/prorate/unusedCredit/upgradeCharge/remainingDays, floor/whole day/whole-day/partial day/half day/half-day/fractional/integer day/integer number of days/day granularity/exact time/remainingMs/milliseconds/rounds down/rounded down/truncat; fix location not identified |
| ❌ | s3-access-denied-kms-key | cloud_auth / configuration | cloud_auth (low) | $0.0000 | 0 | none | 3/3 | missing keywords: kms, GenerateDataKey/kms:Encrypt/kms:*/key policy |
| ❌ | secret-echo-redaction | code | unknown (low) | $0.0000 | 0 | none | 3/3 | category unknown, expected code; missing keywords: round/rounding; fix location not identified |
| ✅ | terraform-state-lock | infrastructure / configuration | infrastructure (low) | $0.0000 | 0 | none | 3/3 |  |
| ❌ | ts-vitest-regression | code | unknown (low) | $0.0000 | 0 | none | 3/3 | category unknown, expected code; missing keywords: discount/applyDiscount; fix location not identified |
| ❌ | two-failures-flake-and-type-error | code | infrastructure (low) | $0.0000 | 0 | none | 3/3 | category infrastructure, expected code; missing keywords: email, optional/undefined/email? |
| ❌ | upstream-major-release-not-the-pr | dependency | unknown (low) | $0.0000 | 0 | none | 3/3 | category unknown, expected dependency; missing keywords: csvforge, 3.0/unpinned/pin/upper bound/<3/release/major version/new version/newer version |
