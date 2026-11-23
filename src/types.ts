/**
 * Shared contracts for ci-triage-agent.
 *
 * Every module codes against these types only, so the GitHub implementation and the
 * eval fixtures are interchangeable behind `TriageBackend`, and the agent never touches
 * Octokit directly. Keep this file free of runtime logic except the constant tables.
 */

// ---------------------------------------------------------------------------
// Classification
// ---------------------------------------------------------------------------

/**
 * Who has to act, and how:
 * - code           the change itself broke the build, tests, lint or types — fix the code
 * - flaky          nondeterministic failure unrelated to the change — rerun / quarantine
 * - dependency     package resolution, lockfile drift, upstream breaking release, registry
 * - infrastructure runner resources (OOM, disk), network, rate limits, outages, state locks
 * - cloud_auth     cloud credentials, OIDC federation, IAM / RBAC permissions, quotas
 * - configuration  workflow YAML, missing secrets/inputs/env, IaC or deploy manifests
 * - unknown        not enough evidence
 */
export type Category =
  "code" | "flaky" | "dependency" | "infrastructure" | "cloud_auth" | "configuration" | "unknown";

export const CATEGORIES: readonly Category[] = [
  "code",
  "flaky",
  "dependency",
  "infrastructure",
  "cloud_auth",
  "configuration",
  "unknown",
] as const;

export type Confidence = "high" | "medium" | "low";
export type Effort = "low" | "medium" | "high" | "xhigh" | "max";

// ---------------------------------------------------------------------------
// GitHub data model (normalized; no Octokit types leak past the gateway)
// ---------------------------------------------------------------------------

export interface RepoRef {
  owner: string;
  repo: string;
}

export interface RunInfo {
  id: number;
  attempt: number;
  workflowId: number;
  workflowName: string;
  /** e.g. ".github/workflows/ci.yml"; null when unknown */
  workflowPath: string | null;
  /** push | pull_request | workflow_dispatch | ... */
  event: string;
  headBranch: string | null;
  headSha: string;
  /** "owner/repo" of the head repository (differs from the base repo for fork PRs) */
  headRepoFullName: string | null;
  isFork: boolean;
  defaultBranch: string;
  /** "failure" | "success" | "cancelled" | ... ; null while in progress */
  conclusion: string | null;
  htmlUrl: string;
  displayTitle: string | null;
  pullRequestNumbers: number[];
  createdAt: string;
}

export interface StepInfo {
  number: number;
  name: string;
  status: string;
  conclusion: string | null;
  startedAt: string | null;
  completedAt: string | null;
}

export interface JobInfo {
  id: number;
  name: string;
  status: string;
  conclusion: string | null;
  startedAt: string | null;
  completedAt: string | null;
  runnerLabels: string[];
  htmlUrl: string | null;
  steps: StepInfo[];
}

export interface ChangedFile {
  path: string;
  /** added | modified | removed | renamed | ... */
  status: string;
  additions: number;
  deletions: number;
  /** unified diff hunk text; null for binary or too-large files */
  patch: string | null;
  previousPath: string | null;
}

export interface JobHistoryEntry {
  runId: number;
  attempt: number;
  headSha: string;
  branch: string | null;
  event: string;
  /** conclusion of the job with the same name in that run */
  conclusion: string | null;
  createdAt: string;
  /** true when this entry is another attempt of the same commit as the failed run */
  sameSha: boolean;
  htmlUrl: string | null;
}

/**
 * Read-only data source for ONE workflow run. Production: GitHub REST API.
 * Evals: recorded fixtures. Implementations must never throw for "not found" cases
 * that have a documented null/empty return; they may throw for transport errors.
 */
export interface TriageBackend {
  readonly repo: RepoRef;
  getRun(): Promise<RunInfo>;
  /** All jobs of the run's current attempt. */
  listJobs(): Promise<JobInfo[]>;
  /** Raw job log exactly as GitHub serves it (timestamp-prefixed lines). */
  getJobLog(jobId: number): Promise<string>;
  /** File content at `ref` (a commit SHA or branch). null = missing or not a regular file. */
  readFile(path: string, ref: string): Promise<string | null>;
  /** Directory entries at `ref`; sub-directories end with "/". null = missing or not a directory. */
  listDirectory(path: string, ref: string): Promise<string[] | null>;
  /** Files changed by the PR (if the run belongs to one) or by the head commit. */
  getChangedFiles(): Promise<ChangedFile[]>;
  /**
   * Recent outcomes of the job with this name: other attempts of the same SHA plus
   * recent completed runs of the same workflow on the default branch. Newest first.
   */
  getJobHistory(jobName: string, limit: number): Promise<JobHistoryEntry[]>;
}

/** Write side, production only (the eval harness never comments). */
export interface CommentPort {
  /** PR number for the run, or null if it is not associated with an open PR. */
  findPullRequest(run: RunInfo): Promise<number | null>;
  findComment(pr: number, marker: string): Promise<ExistingComment | null>;
  /** Creates the comment, or edits the existing one carrying `marker`. */
  upsertComment(
    pr: number,
    marker: string,
    body: string,
  ): Promise<{ id: number; htmlUrl: string; created: boolean }>;
}

export interface ExistingComment {
  id: number;
  body: string;
  htmlUrl: string;
}

// ---------------------------------------------------------------------------
// Logs (src/logs.ts)
// ---------------------------------------------------------------------------

export interface NumberedLine {
  /** 1-based line number in the normalized log (stable across tools and the excerpt) */
  n: number;
  text: string;
}

export interface LogSearchOptions {
  /** Treat pattern as a JavaScript regular expression. Default false = literal substring. */
  regex?: boolean;
  /** Default false. */
  caseSensitive?: boolean;
  /** Lines of context before and after each match. Default 3, max 20. */
  context?: number;
  /** Default 20, max 50. */
  maxMatches?: number;
  /** Restrict to lines attributed to this step number. */
  step?: number;
}

export interface LogMatch {
  line: number;
  /** The matched line plus its context, in order, overlapping windows not merged. */
  context: NumberedLine[];
}

export interface LogSearchResult {
  totalMatches: number;
  matches: LogMatch[];
  /** true when totalMatches > matches.length */
  truncated: boolean;
  /** set when a regex was invalid and a literal search was done instead */
  note?: string;
}

/** Parsed, normalized, searchable view of one job's log. */
export interface LogView {
  readonly jobId: number;
  readonly jobName: string;
  readonly lineCount: number;
  /** true when the raw log exceeded the size cap and its middle was dropped */
  readonly truncated: boolean;
  search(pattern: string, opts?: LogSearchOptions): LogSearchResult;
  /** Inclusive, 1-based, clamped to the log; returns at most 400 lines. */
  slice(start: number, end: number): NumberedLine[];
  /** Every normalized line (for excerpting and signature matching; not for tool output). */
  all(): readonly NumberedLine[];
  /** Step number a line is attributed to (by timestamp), or null. */
  stepOf(line: number): number | null;
  /** Line range attributed to a step (by timestamp), or null if none. */
  stepRange(stepNumber: number): { start: number; end: number } | null;
}

export interface LogExcerpt {
  failedSteps: string[];
  /** Merged, ordered, non-overlapping windows around the strongest error signals. */
  ranges: Array<{ start: number; end: number; lines: NumberedLine[] }>;
  /** Line numbers that triggered windows (error markers, assertion failures, exit codes...). */
  signalLines: number[];
  totalLines: number;
}

// ---------------------------------------------------------------------------
// Known failure signatures (src/signatures.ts)
// ---------------------------------------------------------------------------

export interface SignatureHit {
  id: string;
  title: string;
  category: Category;
  /** One sentence on what usually fixes it. */
  hint: string;
  jobName: string;
  line: number;
  text: string;
}

// ---------------------------------------------------------------------------
// Initial context (src/context.ts)
// ---------------------------------------------------------------------------

export interface FailedJobContext {
  job: JobInfo;
  failedSteps: StepInfo[];
  /** null when the log could not be fetched (see logError) */
  log: LogView | null;
  excerpt: LogExcerpt | null;
  signatures: SignatureHit[];
  logError?: string;
}

export interface TriageContext {
  run: RunInfo;
  /** Failed jobs, capped at maxFailedJobs, most informative first. */
  failedJobs: FailedJobContext[];
  /** Names of failed jobs beyond the cap. */
  omittedFailedJobs: string[];
  /** All jobs of the run (for lookups by name/id in tools). */
  allJobs: JobInfo[];
  changedFiles: ChangedFile[];
  changedFilesError?: string;
}

// ---------------------------------------------------------------------------
// Agent (src/agent/*)
// ---------------------------------------------------------------------------

export interface TriageEvidence {
  job: string;
  /** line number in that job's normalized log, when the evidence is a log line */
  line: number | null;
  excerpt: string;
}

export interface TriageResult {
  category: Category;
  /** One-line headline, e.g. "applyDiscount() now rounds before subtracting" */
  title: string;
  /** 1–3 sentences: what failed and why. */
  root_cause: string;
  evidence: TriageEvidence[];
  /** Markdown; concrete next action(s). */
  suggested_fix: string;
  fix_location: { path: string; line: number | null } | null;
  confidence: Confidence;
  flaky_suspected: boolean;
  rerun_recommended: boolean;
}

export interface ToolCallTrace {
  turn: number;
  name: string;
  input: unknown;
  ok: boolean;
  resultChars: number;
  durationMs: number;
}

export interface UsageTotals {
  requests: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  /** null when a model in the run has no known price */
  costUsd: number | null;
}

export interface AgentLogger {
  info(msg: string): void;
  warning(msg: string): void;
  debug(msg: string): void;
}

export type StopCause = "complete" | "budget" | "max_turns" | "timeout";

export type TriageOutcome =
  | {
      status: "ok";
      result: TriageResult;
      usage: UsageTotals;
      trace: ToolCallTrace[];
      turns: number;
      stopCause: StopCause;
      /** model that produced the final answer (differs from requested when a fallback ran) */
      modelUsed: string;
    }
  | { status: "refused"; usage: UsageTotals; trace: ToolCallTrace[]; turns: number; message: string }
  | { status: "error"; usage: UsageTotals; trace: ToolCallTrace[]; turns: number; message: string };

// ---------------------------------------------------------------------------
// Report (src/report.ts)
// ---------------------------------------------------------------------------

export interface ReportMeta {
  run: RunInfo;
  repo: RepoRef;
  /** "agent" = Claude produced the result; "heuristic" = signature-only fallback */
  mode: "agent" | "heuristic";
  model: string | null;
  usage: UsageTotals | null;
  trace: ToolCallTrace[];
  turns: number;
  stopCause: StopCause | null;
  redactions: number;
  /** Optional operator-visible note, e.g. why heuristic mode was used. */
  note: string | null;
  actionVersion: string;
}

// ---------------------------------------------------------------------------
// Config (src/config.ts)
// ---------------------------------------------------------------------------

export interface Config {
  apiKey: string | null;
  githubToken: string;
  model: string;
  effort: Effort;
  repo: RepoRef;
  runId: number;
  /** Post/update a PR comment. */
  comment: boolean;
  /** When the run succeeded, mark an earlier triage comment on the PR as resolved. */
  resolveOnSuccess: boolean;
  maxTurns: number;
  maxCostUsd: number;
  timeoutSeconds: number;
  maxFailedJobs: number;
  /** Fail the step on internal errors (default false: the action fails open). */
  failOnError: boolean;
  /** Repo-specific hints from the workflow author, appended to the system prompt. */
  extraInstructions: string | null;
}
