/**
 * Known CI failure signatures and a deterministic, no-LLM triage built on them. The
 * signatures also seed the agent's first message as hints; the heuristic triage is the
 * fallback when there is no API key or the agent fails.
 */
import { echoedScriptLines, isIgnorableLine, rankSignals } from "./logs.js";
import type {
  Category,
  FailedJobContext,
  LogView,
  SignatureHit,
  TriageContext,
  TriageEvidence,
  TriageResult,
} from "./types.js";

export interface Signature {
  id: string;
  title: string;
  category: Category;
  hint: string;
  pattern: RegExp;
}

/**
 * Ordered by priority, most specific first: a line is attributed to the first signature it
 * matches, and the heuristic triage prefers earlier entries. Patterns are linear-time (no
 * nested or adjacent unbounded quantifiers) because they run over every log line.
 */
export const SIGNATURES: readonly Signature[] = [
  {
    id: "terraform-state-lock",
    title: "Terraform state lock held",
    category: "infrastructure",
    hint: "Another Terraform run holds the state lock: let it finish, or run `terraform force-unlock <LOCK_ID>` once you are sure no apply is in progress, and serialize runs with a `concurrency` group.",
    pattern: /Error acquiring the state lock|Error locking state/,
  },
  {
    id: "helm-operation-in-progress",
    title: "Helm release stuck in a pending operation",
    category: "infrastructure",
    hint: "An earlier Helm operation on this release never finished: check `helm history <release>`, roll back the pending revision, and deploy with `--atomic` under a `concurrency` group.",
    pattern: /another operation \(install\/upgrade\/rollback\) is in progress/,
  },
  {
    id: "aws-oidc-trust-policy",
    title: "AWS OIDC role assumption denied",
    category: "cloud_auth",
    hint: "The IAM role's trust policy rejects this workflow's OIDC token: make its `token.actions.githubusercontent.com:sub` condition match this repo and ref or environment, with `aud` = `sts.amazonaws.com`.",
    // Anchored on the failing call: IaC plans and policy documents print the bare action name.
    pattern:
      /(?:perform|calling the|operation error STS:) (?:sts:)?AssumeRoleWithWebIdentity\b|Could not assume role with OIDC/,
  },
  {
    id: "aws-credentials-not-loaded",
    title: "AWS credentials not loaded",
    category: "cloud_auth",
    hint: "No AWS credentials were available: grant the job `permissions: id-token: write` for OIDC, or check that the credential secrets are set (secrets are empty for fork pull requests).",
    pattern: /Could not load credentials from any providers|Credentials could not be loaded/,
  },
  {
    id: "aws-expired-token",
    title: "AWS credentials expired or invalid",
    category: "cloud_auth",
    hint: "The AWS credentials are expired or invalid: rotate the stored keys or switch to OIDC, and raise `role-duration-seconds` if a long job outlives its session.",
    pattern:
      /\bExpiredToken(?:Exception)?\b|security token included in the request is (?:expired|invalid)|\bInvalidClientTokenId\b|\bUnrecognizedClientException\b/,
  },
  {
    id: "aws-access-denied",
    title: "AWS permission denied",
    category: "cloud_auth",
    hint: "The IAM principal lacks the named action: allow it on that resource in the role's policy, or check SCPs and permission boundaries if the policy already allows it.",
    pattern:
      /is not authorized to perform:? [a-z0-9-]+:[A-Za-z*]+|\bAccessDenied(?:Exception)?\b|\bUnauthorizedOperation\b/,
  },
  {
    id: "azure-federated-credential",
    title: "Azure federated credential mismatch",
    category: "cloud_auth",
    hint: "No federated credential on the Azure app matches this run's token: add one whose issuer, audience and subject (e.g. `repo:<owner>/<repo>:environment:<name>`) match how the job runs.",
    pattern: /\bAADSTS(?:700213|700212|700211|70021)\b/,
  },
  {
    id: "azure-aadsts",
    title: "Azure AD sign-in rejected",
    category: "cloud_auth",
    hint: "Microsoft Entra ID rejected the sign-in: look up the AADSTS code; the usual fixes are rotating an expired client secret or correcting the tenant or client ID.",
    pattern: /\bAADSTS\d{5,7}\b/,
  },
  {
    id: "azure-authorization-failed",
    title: "Azure RBAC authorization failed",
    category: "cloud_auth",
    hint: "The service principal lacks a role on that scope: assign one that includes the named action (role assignments can take a few minutes to propagate).",
    pattern: /\bAuthorizationFailed\b|does not have authorization to perform action/,
  },
  {
    id: "gcp-permission-denied",
    title: "Google Cloud permission denied",
    category: "cloud_auth",
    hint: "Grant the missing IAM permission to the service account the workflow uses, and check the workload identity provider's attribute condition admits this repository.",
    pattern: /\b(?:IAM_)?PERMISSION_DENIED\b|Permission '[\w.]+' denied/,
  },
  {
    id: "github-token-permissions",
    title: "GITHUB_TOKEN lacks a permission",
    category: "configuration",
    hint: "Add the missing scope under the workflow's or job's `permissions:` (e.g. `pull-requests: write`); runs from forks always get a read-only token.",
    pattern: /Resource not accessible by integration/,
  },
  {
    id: "action-input-required",
    title: "Required action input missing",
    category: "configuration",
    hint: "Pass the input under `with:`; if it comes from a secret, the secret is unset or unavailable to this run (fork pull requests and Dependabot do not get repository secrets).",
    pattern: /Input required and not supplied/,
  },
  {
    id: "invalid-workflow",
    title: "Invalid workflow file",
    category: "configuration",
    hint: "Fix the workflow YAML at the reported line; running actionlint locally catches these before pushing.",
    pattern: /Invalid workflow file|The workflow is not valid|Unrecognized named-value:/,
  },
  {
    id: "ssh-publickey",
    title: "SSH key rejected",
    category: "configuration",
    hint: "Check that the private key secret is set and loaded into the agent, and that its public key is registered as a deploy key or on the target host.",
    pattern: /Permission denied \(publickey/,
  },
  {
    id: "k8s-image-pull",
    title: "Container image could not be pulled",
    category: "configuration",
    hint: "Check that the image tag was actually pushed and the registry path is right, and that the cluster has `imagePullSecrets` for a private registry.",
    pattern: /\b(?:ImagePullBackOff|ErrImagePull)\b|manifest unknown|manifest for \S+ not found/,
  },
  {
    id: "k8s-rollout-timeout",
    title: "Kubernetes rollout timed out",
    category: "configuration",
    hint: "The new pods never became ready: run `kubectl describe pod` and `kubectl logs` on the rollout to find the crash loop, failing readiness probe or missing config.",
    pattern: /timed out waiting for the condition|exceeded its progress deadline/,
  },
  {
    id: "npm-ci-lockfile",
    title: "package-lock.json out of sync",
    category: "dependency",
    hint: "Run `npm install` with the same npm major version as CI and commit the updated package-lock.json.",
    pattern:
      /can only install packages when your package\.json and package-lock\.json|\bMissing: \S+ from lock file|Invalid: lock file's/,
  },
  {
    id: "pnpm-yarn-lockfile",
    title: "Lockfile out of date",
    category: "dependency",
    hint: "Run `pnpm install` or `yarn install` locally and commit the updated lockfile; CI installs with a frozen lockfile.",
    pattern:
      /ERR_PNPM_OUTDATED_LOCKFILE|pnpm-lock\.yaml is not up to date|lockfile needs to be updated, but yarn was run with|\bYN0028\b|lockfile would have been modified by this install/,
  },
  {
    id: "go-mod-outdated",
    title: "go.mod / go.sum out of date",
    category: "dependency",
    hint: "Run `go mod tidy` (plus `go mod vendor` if the module vendors) and commit go.mod and go.sum.",
    pattern: /updates to go\.(?:mod|sum) needed|missing go\.sum entry|go: inconsistent vendoring/,
  },
  {
    id: "npm-eresolve",
    title: "npm peer dependency conflict",
    category: "dependency",
    hint: "Align the conflicting versions named in the `Could not resolve dependency` lines in package.json instead of relying on `--legacy-peer-deps`.",
    pattern: /\bERESOLVE\b/,
  },
  {
    id: "pip-resolution",
    title: "pip could not resolve requirements",
    category: "dependency",
    hint: "Check that the pinned version exists for this Python version and platform, or relax the conflicting pins named in the resolver output.",
    pattern:
      /\bResolutionImpossible\b|No matching distribution found for|Could not find a version that satisfies the requirement/,
  },
  {
    id: "out-of-memory",
    title: "Out of memory",
    category: "infrastructure",
    hint: "Lower parallelism (e.g. `--maxWorkers`, `-j`), raise `NODE_OPTIONS=--max-old-space-size` for Node, or move the job to a larger runner.",
    pattern:
      /JavaScript heap out of memory|\bOOMKilled\b|\bexit(?:ed with)? code 137\b|\bMemoryError\b|\bOutOfMemoryError\b|runtime: out of memory|Cannot allocate memory|^\s*Killed\s*$|\d\s+Killed\s/,
  },
  {
    id: "disk-full",
    title: "Runner disk full",
    category: "infrastructure",
    hint: "Free space before the build (prune Docker images, remove unused toolchains), shrink build outputs, or use a larger runner.",
    // ENOSPC is also how Linux reports an exhausted inotify watch limit, which is not a full disk.
    pattern:
      /No space left on device|\bENOSPC\b(?!: System limit)|Disk quota exceeded|running out of disk space/i,
  },
  {
    id: "cloud-quota-exceeded",
    title: "Cloud quota or capacity exceeded",
    category: "cloud_auth",
    hint: "Request a quota increase, release unused resources, or deploy to another region, zone or instance size.",
    pattern:
      /\bQuotaExceeded\b|\bquota\s[^\n]{0,80}\bexceeded\b|\bexceeded\s[^\n]{0,40}\bquota\b|\bInsufficientInstanceCapacity\b|\bVcpuLimitExceeded\b|\bSkuNotAvailable\b|ZONE_RESOURCE_POOL_EXHAUSTED/i,
  },
  {
    id: "job-timeout",
    title: "Job exceeded its time limit",
    category: "infrastructure",
    hint: "Find the step that stalled (a hung test, an interactive prompt, a network wait) or raise `timeout-minutes` if the work legitimately grew.",
    pattern: /has exceeded the maximum execution time/,
  },
  {
    id: "runner-lost",
    title: "Runner lost or shut down",
    category: "infrastructure",
    hint: "The runner went away mid-job (shutdown, preemption or a crash): rerun the job, and check self-hosted runner health if it recurs.",
    pattern: /runner has received a shutdown signal|lost communication with the server/,
  },
  {
    id: "docker-pull-rate-limit",
    title: "Docker Hub pull rate limit",
    category: "infrastructure",
    hint: "Log in to Docker Hub before pulling (authenticated pulls get a higher limit), or mirror the image to GHCR or another registry.",
    pattern: /\btoomanyrequests\b|reached your (?:unauthenticated )?pull rate limit/i,
  },
  {
    id: "github-api-rate-limit",
    title: "GitHub API rate limit",
    category: "infrastructure",
    hint: "Authenticate API calls with a token, reduce request volume or parallelism, and retry after the rate limit resets.",
    pattern: /API rate limit exceeded|secondary rate limit/i,
  },
  {
    id: "tls-certificate",
    title: "TLS certificate rejected",
    category: "configuration",
    hint: "Renew the expired certificate on the server, or install the CA that signed it into the runner's trust store; do not disable verification.",
    pattern:
      /\bx509: |certificate has expired|\bCERT_HAS_EXPIRED\b|SSL certificate problem|\bSELF_SIGNED_CERT_IN_CHAIN\b|\bUNABLE_TO_(?:GET_ISSUER_CERT_LOCALLY|VERIFY_LEAF_SIGNATURE)\b/,
  },
  {
    id: "network-flake",
    title: "Transient network error",
    category: "infrastructure",
    hint: "Rerun the job; if it recurs, add retries to the download step or use a cache or mirror closer to the runner.",
    pattern:
      /\b(?:ETIMEDOUT|ECONNRESET|EAI_AGAIN|ESOCKETTIMEDOUT)\b|Could not resolve host|TLS handshake timeout|i\/o timeout|connection reset by peer|socket hang up|\b50[23]:? \(?(?:Bad Gateway|Service Unavailable)\b|returned error: 50[23]\b/i,
  },
];

/** Signatures whose failures are usually transient: a rerun is the first thing to try. */
const TRANSIENT_SIGNATURE_IDS: ReadonlySet<string> = new Set([
  "network-flake",
  "docker-pull-rate-limit",
  "github-api-rate-limit",
  "runner-lost",
]);

export function isTransientSignature(id: string): boolean {
  return TRANSIENT_SIGNATURE_IDS.has(id);
}

const PRIORITY = new Map(SIGNATURES.map((signature, index) => [signature.id, index]));
const DEFAULT_MAX_HITS = 8;

/** First hit per signature id, in log order. */
export function matchSignatures(view: LogView, opts: { maxHits?: number } = {}): SignatureHit[] {
  const maxHits = opts.maxHits ?? DEFAULT_MAX_HITS;
  const echoed = echoedScriptLines(view.all());
  const hitIds = new Set<string>();
  const hits: SignatureHit[] = [];
  for (const { n, text } of view.all()) {
    if (hits.length >= maxHits) break;
    if (echoed.has(n) || isIgnorableLine(text)) continue;
    // Only the most specific signature counts for a line, even if it already matched elsewhere.
    const signature = SIGNATURES.find((s) => s.pattern.test(text));
    if (!signature || hitIds.has(signature.id)) continue;
    hitIds.add(signature.id);
    const { id, title, category, hint } = signature;
    hits.push({ id, title, category, hint, jobName: view.jobName, line: n, text });
  }
  return hits;
}

// ---------------------------------------------------------------------------
// Heuristic triage
// ---------------------------------------------------------------------------

const MAX_QUOTED_CHARS = 200;

interface CandidateHit {
  hit: SignatureHit;
  job: FailedJobContext;
  jobIndex: number;
  inFailedStep: boolean;
}

/** Deterministic, no-LLM triage from signatures + excerpt. Used without an API key or when the agent fails. */
export function heuristicTriage(ctx: TriageContext): TriageResult {
  const best = bestHit(ctx.failedJobs);
  if (best) return triageFromSignature(best);
  const primary = ctx.failedJobs[0];
  return primary ? triageFromSignals(primary) : triageWithoutFailedJobs(ctx);
}

/** Hits inside a failed step first, then by signature priority, job order and line. */
function bestHit(jobs: readonly FailedJobContext[]): CandidateHit | null {
  // A hit inside a step that succeeded (say, a cache restore that timed out and recovered)
  // did not fail the job, so it must not become the headline.
  const candidates = jobs.flatMap((job, jobIndex) =>
    job.signatures
      .filter((hit) => !isInSucceededStep(job, hit.line))
      .map((hit) => ({ hit, job, jobIndex, inFailedStep: isInFailedStep(job, hit.line) })),
  );
  candidates.sort(
    (a, b) =>
      Number(b.inFailedStep) - Number(a.inFailedStep) ||
      priorityOf(a.hit) - priorityOf(b.hit) ||
      a.jobIndex - b.jobIndex ||
      a.hit.line - b.hit.line,
  );
  return candidates[0] ?? null;
}

function priorityOf(hit: SignatureHit): number {
  return PRIORITY.get(hit.id) ?? SIGNATURES.length;
}

function isInFailedStep(job: FailedJobContext, line: number): boolean {
  const step = job.log?.stepOf(line) ?? null;
  return step !== null && job.failedSteps.some((s) => s.number === step);
}

function isInSucceededStep(job: FailedJobContext, line: number): boolean {
  const step = job.log?.stepOf(line) ?? null;
  return step !== null && job.job.steps.some((s) => s.number === step && s.conclusion === "success");
}

function stepNameAt(job: FailedJobContext, line: number): string | null {
  const step = job.log?.stepOf(line) ?? null;
  return job.job.steps.find((s) => s.number === step)?.name ?? null;
}

function triageFromSignature({ hit, job }: CandidateHit): TriageResult {
  const jobName = job.job.name;
  const step = stepNameAt(job, hit.line);
  const where = step ? ` in step "${step}"` : "";
  return {
    category: hit.category,
    title: `${hit.title} in ${jobName}`,
    root_cause: `Job "${jobName}" failed${where}: log line ${hit.line} matches the known failure pattern "${hit.title}".`,
    evidence: [
      { job: jobName, line: hit.line, excerpt: hit.text },
      ...signalEvidence(job).filter((e) => e.line !== hit.line),
    ].slice(0, 3),
    suggested_fix: hit.hint,
    fix_location: null,
    confidence: "low",
    flaky_suspected: isTransientSignature(hit.id),
    rerun_recommended: hit.category === "infrastructure",
  };
}

function triageFromSignals(job: FailedJobContext): TriageResult {
  const jobName = job.job.name;
  const failedStep = job.failedSteps[0]?.name ?? null;
  const evidence = signalEvidence(job).slice(0, 3);
  const lead = evidence[0];
  const where = failedStep ? ` at step "${failedStep}"` : "";

  let rootCause: string;
  let fix: string;
  if (!job.log) {
    const reason = job.logError ? ` (${job.logError})` : "";
    rootCause = `Job "${jobName}" failed${where}, but its log could not be fetched${reason}, so there was no log evidence to analyse.`;
    fix = job.job.htmlUrl
      ? `Open the [job log](${job.job.htmlUrl}) and look for the first error in the failed step.`
      : "Open the job log on the run page and look for the first error in the failed step.";
  } else if (lead && lead.line !== null) {
    rootCause = `Job "${jobName}" failed${where}. The first error reported is at log line ${lead.line}: ${quote(lead.excerpt)}`;
    fix = `No known failure signature matched. Start from line ${lead.line} of the \`${jobName}\` log excerpt and the command output just above it.`;
  } else {
    rootCause = `Job "${jobName}" failed${where}, and no recognizable error line was found in its log.`;
    fix = `No known failure signature matched. Read the end of the \`${jobName}\` log excerpt, where the failing command's last output is.`;
  }

  return {
    category: "unknown",
    title: failedStep ? `${jobName} failed at step ${failedStep}` : `${jobName} failed`,
    root_cause: rootCause,
    evidence,
    suggested_fix: fix,
    fix_location: null,
    confidence: "low",
    flaky_suspected: false,
    rerun_recommended: false,
  };
}

function triageWithoutFailedJobs(ctx: TriageContext): TriageResult {
  return {
    category: "unknown",
    title: `${ctx.run.workflowName || "Workflow"} failed without a failed job`,
    root_cause:
      "No failed job was found in this run, so there was no job log to analyse; the failure is likely at the workflow level, such as an invalid workflow file or a run that never started.",
    evidence: [],
    suggested_fix: `Open the [workflow run](${ctx.run.htmlUrl}) and check the error shown above the job list.`,
    fix_location: null,
    confidence: "low",
    flaky_suspected: false,
    rerun_recommended: false,
  };
}

/** Strongest signal lines that made it into the job's excerpt, best first. */
function signalEvidence(job: FailedJobContext): TriageEvidence[] {
  if (!job.log) return [];
  const inExcerpt = job.excerpt ? new Set(job.excerpt.signalLines) : null;
  return rankSignals(job.log, job.job)
    .filter((signal) => inExcerpt === null || inExcerpt.has(signal.n))
    .map((signal) => ({ job: job.job.name, line: signal.n, excerpt: signal.text }));
}

function quote(text: string): string {
  const trimmed = text.trim();
  return `"${trimmed.length > MAX_QUOTED_CHARS ? `${trimmed.slice(0, MAX_QUOTED_CHARS)}…` : trimmed}"`;
}
