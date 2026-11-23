import { describe, expect, it } from "vitest";
import { extractExcerpt, failedStepsOf, parseJobLog } from "../src/logs.js";
import { heuristicTriage, isTransientSignature, matchSignatures, SIGNATURES } from "../src/signatures.js";
import { CATEGORIES } from "../src/types.js";
import type { FailedJobContext, JobInfo, RunInfo, StepInfo, TriageContext } from "../src/types.js";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const BASE_MS = Date.UTC(2026, 2, 2, 10, 0, 0);

function ts(offset: number): string {
  return new Date(BASE_MS + Math.round(offset * 1000)).toISOString().replace("Z", "0000Z");
}

function stepTime(offset: number): string {
  return new Date(BASE_MS + offset * 1000).toISOString().replace(".000Z", "Z");
}

function step(number: number, name: string, conclusion: string, start: number, end: number): StepInfo {
  return {
    number,
    name,
    status: "completed",
    conclusion,
    startedAt: stepTime(start),
    completedAt: stepTime(end),
  };
}

function job(id: number, name: string, steps: StepInfo[]): JobInfo {
  return {
    id,
    name,
    status: "completed",
    conclusion: "failure",
    startedAt: stepTime(0),
    completedAt: stepTime(60),
    runnerLabels: ["ubuntu-latest"],
    htmlUrl: `https://github.com/example-org/webapp/actions/runs/7001/job/${id}`,
    steps,
  };
}

/** Setup (0-5s, success), a failing step (5-50s), and a post step (50-60s). */
function standardJob(id: number, name: string, failingStep: string): JobInfo {
  return job(id, name, [
    step(1, "Set up job", "success", 0, 4),
    step(2, failingStep, "failure", 5, 50),
    step(3, "Complete job", "success", 51, 60),
  ]);
}

const RUN: RunInfo = {
  id: 7001,
  attempt: 1,
  workflowId: 42,
  workflowName: "CI",
  workflowPath: ".github/workflows/ci.yml",
  event: "pull_request",
  headBranch: "feature/discounts",
  headSha: "0123456789abcdef0123456789abcdef01234567",
  headRepoFullName: "example-org/webapp",
  isFork: false,
  defaultBranch: "main",
  conclusion: "failure",
  htmlUrl: "https://github.com/example-org/webapp/actions/runs/7001",
  displayTitle: "Round discounts after subtracting",
  pullRequestNumbers: [12],
  createdAt: stepTime(0),
};

/** Timestamped log: `setup` lines in step 1, `failing` lines in step 2, then the exit marker. */
function stepLog(setup: string[], failing: string[], exitCode = 1): string {
  const lines = [
    ...setup.map((text, i) => `${ts(1 + i * 0.01)} ${text}`),
    ...failing.map((text, i) => `${ts(6 + i * 0.01)} ${text}`),
    `${ts(49)} ##[error]Process completed with exit code ${exitCode}.`,
    `${ts(52)} Cleaning up orphan processes`,
  ];
  return lines.join("\n") + "\n";
}

function failedJobContext(raw: string, info: JobInfo): FailedJobContext {
  const log = parseJobLog(raw, info);
  return {
    job: info,
    failedSteps: failedStepsOf(info),
    log,
    excerpt: extractExcerpt(log, info),
    signatures: matchSignatures(log),
  };
}

function contextOf(...failedJobs: FailedJobContext[]): TriageContext {
  return {
    run: RUN,
    failedJobs,
    omittedFailedJobs: [],
    allJobs: failedJobs.map((j) => j.job),
    changedFiles: [],
  };
}

function viewOf(...lines: string[]) {
  return parseJobLog(lines.join("\n"), job(1, "build", []));
}

function firstSignatureId(line: string): string | undefined {
  return SIGNATURES.find((s) => s.pattern.test(line))?.id;
}

// ---------------------------------------------------------------------------
// Signature table
// ---------------------------------------------------------------------------

/** One realistic line per case; the expected id must be the FIRST signature that matches. */
const POSITIVE: ReadonlyArray<readonly [id: string, line: string]> = [
  ["terraform-state-lock", "│ Error: Error acquiring the state lock"],
  [
    "terraform-state-lock",
    "│ Error: Error acquiring the state lock: ConditionalCheckFailedException: The conditional request failed",
  ],
  [
    "helm-operation-in-progress",
    "Error: UPGRADE FAILED: another operation (install/upgrade/rollback) is in progress",
  ],
  [
    "aws-oidc-trust-policy",
    "Error: Could not assume role with OIDC: Not authorized to perform sts:AssumeRoleWithWebIdentity",
  ],
  [
    "aws-oidc-trust-policy",
    "An error occurred (AccessDenied) when calling the AssumeRoleWithWebIdentity operation: Not authorized to perform sts:AssumeRoleWithWebIdentity",
  ],
  [
    "aws-oidc-trust-policy",
    "Error: configuring Terraform AWS Provider: operation error STS: AssumeRoleWithWebIdentity, https response error StatusCode: 403, RequestID: 00000000-0000-0000-0000-000000000000, api error AccessDenied: Not authorized to perform sts:AssumeRoleWithWebIdentity",
  ],
  [
    "aws-oidc-trust-policy",
    "An error occurred (InvalidIdentityToken) when calling the AssumeRoleWithWebIdentity operation: No OpenIDConnect provider found in your account for https://token.actions.githubusercontent.com",
  ],
  [
    "aws-credentials-not-loaded",
    "Error: Credentials could not be loaded, please check your action inputs: Could not load credentials from any providers",
  ],
  [
    "aws-expired-token",
    "An error occurred (ExpiredToken) when calling the GetCallerIdentity operation: The security token included in the request is expired",
  ],
  [
    "aws-expired-token",
    "An error occurred (InvalidClientTokenId) when calling the GetCallerIdentity operation: The security token included in the request is invalid.",
  ],
  [
    "aws-access-denied",
    'An error occurred (AccessDenied) when calling the PutObject operation: User: arn:aws:sts::123456789012:assumed-role/ci-deploy/GitHubActions is not authorized to perform: s3:PutObject on resource: "arn:aws:s3:::acme-artifacts/build.zip"',
  ],
  [
    "aws-access-denied",
    "Error: creating Lambda Function (acme-api): AccessDeniedException: User is not authorized to perform: lambda:CreateFunction",
  ],
  [
    "azure-federated-credential",
    "Error: AADSTS700213: No matching federated identity record found for presented assertion subject 'repo:example-org/webapp:ref:refs/heads/feature/discounts'.",
  ],
  [
    "azure-federated-credential",
    "AADSTS70021: No matching federated identity record found for presented assertion.",
  ],
  [
    "azure-aadsts",
    "Error: AADSTS7000222: The provided client secret keys for app '00000000-0000-0000-0000-000000000000' are expired.",
  ],
  [
    "azure-authorization-failed",
    "ERROR: (AuthorizationFailed) The client '00000000-0000-0000-0000-000000000000' with object id '00000000-0000-0000-0000-000000000000' does not have authorization to perform action 'Microsoft.Resources/deployments/validate/action' over scope '/subscriptions/00000000-0000-0000-0000-000000000000/resourcegroups/rg-acme'",
  ],
  [
    "gcp-permission-denied",
    "ERROR: (gcloud.run.deploy) PERMISSION_DENIED: Permission 'run.services.get' denied on resource 'namespaces/acme-prod/services/api' (or resource may not exist).",
  ],
  ["github-token-permissions", "Error: Resource not accessible by integration"],
  ["action-input-required", "##[error]Input required and not supplied: token"],
  [
    "invalid-workflow",
    "##[error]Invalid workflow file: .github/workflows/deploy.yml#L24: Unrecognized named-value: 'secret'",
  ],
  ["ssh-publickey", "git@github.com: Permission denied (publickey)."],
  ["k8s-image-pull", "api-7d9f8b6c5-x2x9q   0/1     ImagePullBackOff   0          2m"],
  [
    "k8s-image-pull",
    "Error response from daemon: manifest for ghcr.io/example-org/api:sha-0123456 not found: manifest unknown",
  ],
  ["k8s-rollout-timeout", 'error: deployment "api" exceeded its progress deadline'],
  ["k8s-rollout-timeout", "Error: UPGRADE FAILED: timed out waiting for the condition"],
  [
    "npm-ci-lockfile",
    "npm ERR! `npm ci` can only install packages when your package.json and package-lock.json or npm-shrinkwrap.json are in sync. Please update your lock file with `npm install` before continuing.",
  ],
  ["npm-ci-lockfile", "npm error Missing: left-pad@1.3.0 from lock file"],
  [
    "pnpm-yarn-lockfile",
    ' ERR_PNPM_OUTDATED_LOCKFILE  Cannot install with "frozen-lockfile" because pnpm-lock.yaml is not up to date with package.json',
  ],
  [
    "pnpm-yarn-lockfile",
    "error Your lockfile needs to be updated, but yarn was run with `--frozen-lockfile`.",
  ],
  [
    "pnpm-yarn-lockfile",
    "➤ YN0028: │ The lockfile would have been modified by this install, which is explicitly forbidden.",
  ],
  ["go-mod-outdated", "go: updates to go.mod needed; to update it:"],
  [
    "go-mod-outdated",
    "main.go:7:2: missing go.sum entry for module providing package github.com/example-org/acme-sdk (imported by example.com/api); to add:",
  ],
  ["npm-eresolve", "npm ERR! code ERESOLVE"],
  ["npm-eresolve", "npm error ERESOLVE unable to resolve dependency tree"],
  ["pip-resolution", "ERROR: No matching distribution found for acme-internal-sdk==9.9.9"],
  [
    "pip-resolution",
    "ERROR: ResolutionImpossible: for help visit https://pip.pypa.io/en/latest/topics/dependency-resolution/",
  ],
  ["out-of-memory", "FATAL ERROR: Reached heap limit Allocation failed - JavaScript heap out of memory"],
  ["out-of-memory", "##[error]Process completed with exit code 137."],
  ["out-of-memory", "api-7d9f8b6c5-x2x9q   0/1     OOMKilled   3          5m"],
  ["out-of-memory", "/home/runner/work/_temp/0a1b2c.sh: line 1:  2345 Killed                  pytest -n 8"],
  ["out-of-memory", "Killed"],
  ["out-of-memory", "E   MemoryError"],
  ["disk-full", "OSError: [Errno 28] No space left on device: '/home/runner/work/webapp/dist'"],
  ["disk-full", "npm ERR! code ENOSPC"],
  [
    "disk-full",
    "##[warning]You are running out of disk space. The runner will stop working when the machine runs out of disk space. Free space left: 72 MB",
  ],
  [
    "cloud-quota-exceeded",
    "Error: creating EC2 Instance: VcpuLimitExceeded: You have requested more vCPU capacity than your current vCPU limit of 32 allows",
  ],
  [
    "cloud-quota-exceeded",
    "ERROR: (gcloud.compute.instances.create) Could not fetch resource: - Quota 'CPUS' exceeded. Limit: 24.0 in region us-central1.",
  ],
  [
    "cloud-quota-exceeded",
    "(QuotaExceeded) Operation could not be completed as it results in exceeding approved Total Regional Cores quota.",
  ],
  [
    "cloud-quota-exceeded",
    'Error from server (Forbidden): pods "api-0" is forbidden: exceeded quota: compute-resources, requested: limits.cpu=2',
  ],
  [
    "cloud-quota-exceeded",
    "Error 403: Quota exceeded for quota metric 'Queries' and limit 'Queries per minute' of service 'compute.googleapis.com'",
  ],
  [
    "job-timeout",
    "##[error]The job running on runner GitHub Actions 3 has exceeded the maximum execution time of 30 minutes.",
  ],
  [
    "runner-lost",
    "##[error]The runner has received a shutdown signal. This can happen when the runner service is stopped, or a manually started runner is canceled.",
  ],
  ["runner-lost", "##[error]The hosted runner: GitHub Actions 7 lost communication with the server."],
  [
    "docker-pull-rate-limit",
    "Error response from daemon: toomanyrequests: You have reached your pull rate limit. You may increase the limit by authenticating and upgrading: https://www.docker.com/increase-rate-limit",
  ],
  ["github-api-rate-limit", "Error: API rate limit exceeded for installation ID 12345678."],
  [
    "github-api-rate-limit",
    "HttpError: You have exceeded a secondary rate limit. Please wait a few minutes before you try again.",
  ],
  [
    "tls-certificate",
    'Error: Get "https://registry.acme.example/v2/": x509: certificate has expired or is not yet valid',
  ],
  ["tls-certificate", "Error: certificate has expired (CERT_HAS_EXPIRED)"],
  [
    "tls-certificate",
    "fatal: unable to access 'https://git.acme.example/repo.git/': SSL certificate problem: self signed certificate in certificate chain",
  ],
  [
    "network-flake",
    "npm ERR! network request to https://registry.npmjs.org/left-pad failed, reason: connect ETIMEDOUT 104.16.0.35:443",
  ],
  ["network-flake", "Error: read ECONNRESET"],
  ["network-flake", "getaddrinfo EAI_AGAIN registry.npmjs.org"],
  [
    "network-flake",
    "fatal: unable to access 'https://github.com/example-org/webapp/': Could not resolve host: github.com",
  ],
  [
    "network-flake",
    'Error response from daemon: Get "https://registry-1.docker.io/v2/": net/http: TLS handshake timeout',
  ],
  ["network-flake", "dial tcp 10.0.0.12:443: i/o timeout"],
  ["network-flake", "read tcp 10.1.0.4:51234->140.82.112.3:443: read: connection reset by peer"],
  ["network-flake", "curl: (22) The requested URL returned error: 503"],
  ["network-flake", "Response status code does not indicate success: 502 (Bad Gateway)."],
];

/** Lines that look alarming but must not match any signature. */
const NEGATIVE: readonly string[] = [
  "Found 0 errors. Watching for file changes.",
  " RUN  test/error-handling.test.ts",
  "Tests: 0 failed, 42 passed",
  "Run terraform plan -lock-timeout=5m",
  "AccessDeniedHandler registered for /admin",
  "Error: ENOSPC: System limit for number of file watchers reached, watch '/home/runner/work/webapp/src'",
  "##[error]Process completed with exit code 1.",
  "##[error]Process completed with exit code 1370.",
  "Killed 3 stale worker processes",
  "Checking quota usage: 10 of 32 vCPUs in use",
  "Run helm upgrade api ./chart --wait --timeout 5m",
  "Cache restored from key: npm-linux-x64-0123abcd",
  // An app's own quota feature in file and module names.
  "src/billing.ts(3,24): error TS2307: Cannot find module './quota-exceeded-banner' or its corresponding type declarations.",
  " FAIL  src/components/quota-exceeded.test.tsx > shows the upgrade prompt",
  // IaC plans and policy documents that manage the OIDC role print the bare action name.
  '      + "Action": "sts:AssumeRoleWithWebIdentity",',
  '          + action    = "sts:AssumeRoleWithWebIdentity"',
];

describe("SIGNATURES", () => {
  it("has at least 25 signatures with unique ids, valid categories and one-sentence hints", () => {
    expect(SIGNATURES.length).toBeGreaterThanOrEqual(25);
    expect(new Set(SIGNATURES.map((s) => s.id)).size).toBe(SIGNATURES.length);
    for (const signature of SIGNATURES) {
      expect(CATEGORIES).toContain(signature.category);
      expect(signature.category).not.toBe("unknown");
      expect(signature.title.length).toBeGreaterThan(0);
      expect(signature.hint).toMatch(/\.$/);
      expect(signature.hint).not.toMatch(/\.\s+[A-Z]/);
      // A global or sticky regex keeps lastIndex between .test() calls and would skip lines.
      expect(signature.pattern.flags).not.toMatch(/[gy]/);
    }
  });

  it("has at least one positive example per signature", () => {
    const covered = new Set(POSITIVE.map(([id]) => id));
    expect(SIGNATURES.map((s) => s.id).filter((id) => !covered.has(id))).toEqual([]);
  });

  it.each(POSITIVE)("%s is the first match for %s", (id, line) => {
    expect(firstSignatureId(line)).toBe(id);
    expect(matchSignatures(viewOf(line))[0]?.id).toBe(id);
  });

  it.each(NEGATIVE)("nothing matches %s", (line) => {
    expect(firstSignatureId(line)).toBeUndefined();
  });

  it("puts cloud quota under cloud_auth and transient failures under infrastructure", () => {
    const category = (id: string) => SIGNATURES.find((s) => s.id === id)?.category;
    expect(category("cloud-quota-exceeded")).toBe("cloud_auth");
    expect(category("k8s-image-pull")).toBe("configuration");
    expect(category("github-token-permissions")).toBe("configuration");
    expect(category("terraform-state-lock")).toBe("infrastructure");
    for (const s of SIGNATURES.filter((s) => isTransientSignature(s.id)))
      expect(s.category).toBe("infrastructure");
  });

  it("matches each pattern in linear time on adversarial input", () => {
    const adversarial = [
      "quota ".repeat(400),
      "exceeded ".repeat(250),
      `${"x".repeat(1990)}!`,
      "\u001b[".repeat(1000),
      `${"1 ".repeat(999)}Killed`,
    ];
    const started = Date.now();
    for (const text of adversarial) for (const s of SIGNATURES) s.pattern.test(text);
    expect(Date.now() - started).toBeLessThan(500);
  });
});

// ---------------------------------------------------------------------------
// matchSignatures
// ---------------------------------------------------------------------------

describe("matchSignatures", () => {
  it("returns the first hit per signature in log order, with job name, line and text", () => {
    const view = viewOf(
      "Run tests",
      "Error: read ECONNRESET",
      "Error: connect ETIMEDOUT 140.82.112.3:443",
      "npm ERR! code ERESOLVE",
      "Error: read ECONNRESET",
    );
    expect(matchSignatures(view)).toEqual([
      expect.objectContaining({
        id: "network-flake",
        jobName: "build",
        line: 2,
        text: "Error: read ECONNRESET",
      }),
      expect.objectContaining({ id: "npm-eresolve", line: 4, category: "dependency" }),
    ]);
  });

  it("attributes a line only to its most specific signature", () => {
    const hits = matchSignatures(
      viewOf(
        "An error occurred (AccessDenied) when calling the AssumeRoleWithWebIdentity operation: Not authorized to perform sts:AssumeRoleWithWebIdentity",
      ),
    );
    expect(hits.map((h) => h.id)).toEqual(["aws-oidc-trust-policy"]);
  });

  it("skips debug lines, passing tests and echoed step scripts", () => {
    const view = viewOf(
      "##[debug]Error: connect ETIMEDOUT 10.0.0.1:443",
      "    ✓ handles ETIMEDOUT retry (3 ms)",
      "--- PASS: TestRetryOnECONNRESET (0.00s)",
      "##[group]Run ./scripts/check-disk.sh 'No space left on device'",
      "./scripts/check-disk.sh 'No space left on device'",
      "shell: /usr/bin/bash -e {0}",
      "##[endgroup]",
      "Disk check passed",
    );
    expect(matchSignatures(view)).toEqual([]);
  });

  it("still matches after a step's own ::group::Run that never closed", () => {
    const view = viewOf(
      "##[group]Run ./deploy.sh",
      "./deploy.sh",
      "shell: /usr/bin/bash -e {0}",
      "##[endgroup]",
      "##[group]Run terraform apply",
      "│ Error: Error acquiring the state lock",
      "##[error]Process completed with exit code 1.",
      "##[group]Run actions/cache/save@v4",
      "with:",
      "  path: ~/.terraform.d",
      "##[endgroup]",
    );
    expect(matchSignatures(view).map((h) => [h.id, h.line])).toEqual([["terraform-state-lock", 6]]);
  });

  it("caps the number of hits", () => {
    const view = viewOf(
      "npm ERR! code ERESOLVE",
      "Error: read ECONNRESET",
      "No space left on device",
      "Error: Resource not accessible by integration",
    );
    expect(matchSignatures(view, { maxHits: 2 }).map((h) => h.id)).toEqual(["npm-eresolve", "network-flake"]);
    expect(matchSignatures(view)).toHaveLength(4);
  });
});

// ---------------------------------------------------------------------------
// heuristicTriage
// ---------------------------------------------------------------------------

describe("heuristicTriage", () => {
  it("builds a low-confidence triage from the best signature hit", () => {
    const deploy = standardJob(201, "deploy", "Upload artifacts");
    const accessDenied =
      'upload failed: ./build.zip to s3://acme-artifacts/build.zip An error occurred (AccessDenied) when calling the PutObject operation: User: arn:aws:sts::123456789012:assumed-role/ci-deploy/GitHubActions is not authorized to perform: s3:PutObject on resource: "arn:aws:s3:::acme-artifacts/build.zip"';
    const ctx = contextOf(
      failedJobContext(stepLog(["Current runner version: '2.321.0'"], [accessDenied]), deploy),
    );
    const hitLine = ctx.failedJobs[0]?.signatures[0]?.line;

    const result = heuristicTriage(ctx);

    expect(result).toMatchObject({
      category: "cloud_auth",
      title: "AWS permission denied in deploy",
      confidence: "low",
      flaky_suspected: false,
      rerun_recommended: false,
      fix_location: null,
      suggested_fix: SIGNATURES.find((s) => s.id === "aws-access-denied")?.hint,
    });
    expect(result.root_cause).toContain('Job "deploy"');
    expect(result.root_cause).toContain(`line ${hitLine}`);
    expect(result.root_cause).toContain('step "Upload artifacts"');
    expect(result.evidence[0]).toEqual({ job: "deploy", line: hitLine, excerpt: accessDenied });
    expect(result.evidence.length).toBeGreaterThan(1);
    expect(result.evidence.length).toBeLessThanOrEqual(3);
    for (const evidence of result.evidence) expect(evidence.job).toBe("deploy");
  });

  it("prefers a hit inside a failed step over a higher-priority hit elsewhere, and flags transient ones", () => {
    const test = standardJob(202, "test", "Run tests");
    const raw = stepLog(
      ["##[warning]Error: Resource not accessible by integration"],
      ["Error: connect ETIMEDOUT 140.82.112.3:443"],
    );
    const ctx = contextOf(failedJobContext(raw, test));
    expect(ctx.failedJobs[0]?.signatures.map((h) => h.id)).toEqual([
      "github-token-permissions",
      "network-flake",
    ]);

    const result = heuristicTriage(ctx);

    expect(result.title).toBe("Transient network error in test");
    expect(result.category).toBe("infrastructure");
    expect(result.flaky_suspected).toBe(true);
    expect(result.rerun_recommended).toBe(true);
  });

  it("looks for hits across all failed jobs", () => {
    const lint = failedJobContext(
      stepLog([], ["src/a.ts:1:1 error Missing semicolon"]),
      standardJob(203, "lint", "Lint"),
    );
    const build = failedJobContext(
      stepLog([], ["npm ERR! code ERESOLVE", "npm ERR! ERESOLVE unable to resolve dependency tree"]),
      standardJob(204, "build", "Install"),
    );
    const result = heuristicTriage(contextOf(lint, build));
    expect(result.title).toBe("npm peer dependency conflict in build");
    expect(result.category).toBe("dependency");
  });

  it("falls back to the strongest error line when no signature matches", () => {
    const typecheck = standardJob(205, "typecheck", "Typecheck");
    const annotation =
      "##[error]src/cart.ts(12,5): error TS2345: Argument of type 'string' is not assignable to parameter of type 'number'.";
    const raw = stepLog(["Error: deprecated option --legacy in setup"], ["> tsc --noEmit", annotation], 2);
    const ctx = contextOf(failedJobContext(raw, typecheck));
    expect(ctx.failedJobs[0]?.signatures).toEqual([]);
    const annotationLine = ctx.failedJobs[0]?.log?.all().find((l) => l.text === annotation)?.n;

    const result = heuristicTriage(ctx);

    expect(result).toMatchObject({
      category: "unknown",
      title: "typecheck failed at step Typecheck",
      confidence: "low",
      flaky_suspected: false,
      rerun_recommended: false,
      fix_location: null,
    });
    expect(result.root_cause).toContain(`line ${annotationLine}`);
    expect(result.root_cause).toContain("error TS2345");
    expect(result.evidence[0]).toEqual({ job: "typecheck", line: annotationLine, excerpt: annotation });
    expect(result.evidence.length).toBeLessThanOrEqual(3);
    expect(result.suggested_fix).toContain(`line ${annotationLine}`);
  });

  it("does not throw when no job failed", () => {
    const result = heuristicTriage(contextOf());
    expect(result.category).toBe("unknown");
    expect(result.title).toContain("CI");
    expect(result.evidence).toEqual([]);
    expect(result.suggested_fix).toContain(RUN.htmlUrl);
  });

  it("does not throw when a failed job's log could not be fetched", () => {
    const info = standardJob(206, "e2e", "Run Playwright");
    const ctx = contextOf({
      job: info,
      failedSteps: failedStepsOf(info),
      log: null,
      excerpt: null,
      signatures: [],
      logError: "Logs for job 206 are unavailable (expired or deleted)",
    });

    const result = heuristicTriage(ctx);

    expect(result.title).toBe("e2e failed at step Run Playwright");
    expect(result.root_cause).toContain("expired or deleted");
    expect(result.evidence).toEqual([]);
    expect(result.suggested_fix).toContain(info.htmlUrl ?? "");
  });

  it("handles a failed job without steps or signals", () => {
    const info = job(207, "matrix-setup", []);
    const result = heuristicTriage(contextOf(failedJobContext("just some output\n", info)));
    expect(result.title).toBe("matrix-setup failed");
    expect(result.evidence).toEqual([]);
    expect(result.root_cause).toContain("no recognizable error line");
  });
});

describe("heuristicTriage ignores hits from steps that succeeded", () => {
  it("does not blame a recovered cache timeout in the setup step", () => {
    const info = standardJob(901, "test", "Run npm test");
    const raw = stepLog(
      ["##[warning]Failed to restore: getCacheEntry failed: connect ETIMEDOUT 10.1.2.3:443"],
      [
        "FAIL test/cart.test.ts > discounts then taxes a 100.00 order",
        "AssertionError: expected 100 to be 90",
      ],
    );
    const result = heuristicTriage(contextOf(failedJobContext(raw, info)));
    expect(result.category).toBe("unknown");
    expect(result.flaky_suspected).toBe(false);
  });
});
