/**
 * GitHub REST implementation of `TriageBackend` (read side) and `CommentPort` (write side)
 * for a single workflow run. Octokit types stay inside this module: everything returned is
 * normalized to the shapes in ../types.ts.
 */
import { setTimeout as delay } from "node:timers/promises";
import type { getOctokit } from "@actions/github";
import type {
  ChangedFile,
  CommentPort,
  ExistingComment,
  JobHistoryEntry,
  JobInfo,
  RepoRef,
  RunInfo,
  StepInfo,
  TriageBackend,
} from "../types.js";

export type Octokit = ReturnType<typeof getOctokit>;

export type Sleep = (ms: number) => Promise<void>;

export interface GitHubBackendOptions {
  /** Waits between retries. Defaults to a real timer; tests pass an instant one. */
  sleep?: Sleep;
  /** Triage this attempt (with its own conclusion) instead of the run's latest one. */
  attempt?: { attempt: number; conclusion: string | null } | null;
}

type Rest = Octokit["rest"];
type ResponseData<F extends (...args: never[]) => Promise<{ data: unknown }>> = Awaited<
  ReturnType<F>
>["data"];
type WorkflowRun = ResponseData<Rest["actions"]["getWorkflowRun"]>;
type Job = ResponseData<Rest["actions"]["listJobsForWorkflowRunAttempt"]>["jobs"][number];
type DiffEntry = NonNullable<ResponseData<Rest["repos"]["getCommit"]>["files"]>[number];
type IssueComment = ResponseData<Rest["issues"]["listComments"]>[number];

const PER_PAGE = 100;
const MAX_CHANGED_FILES = 300;
const HISTORY_CONCURRENCY = 4;
const MAX_RETRIES = 2;
const BASE_BACKOFF_MS = 1_000;
const MAX_BACKOFF_MS = 10_000;

/** TriageBackend + CommentPort over the GitHub REST API for one workflow run. */
export function createGitHubBackend(
  octokit: Octokit,
  repo: RepoRef,
  runId: number,
  options: GitHubBackendOptions = {},
): TriageBackend & CommentPort {
  const rest = octokit.rest;
  const base = { owner: repo.owner, repo: repo.repo };
  const sleep = options.sleep ?? ((ms: number) => delay(ms));

  /** Retries transient failures; safe for reads and idempotent writes. */
  const call = <T>(operation: () => Promise<T>): Promise<T> => withRetry(operation, sleep, isTransient);

  let runPromise: Promise<RunInfo> | null = null;

  function getRun(): Promise<RunInfo> {
    runPromise ??= fetchRun().catch((error: unknown) => {
      runPromise = null; // let a later caller try again instead of caching the failure
      throw error;
    });
    return runPromise;
  }

  async function fetchRun(): Promise<RunInfo> {
    const { data } = await call(() => rest.actions.getWorkflowRun({ ...base, run_id: runId }));
    const run = toRunInfo(data, await resolveDefaultBranch(data));
    const pinned = options.attempt;
    // An older attempt than the latest (a re-run started meanwhile): list that attempt's own
    // jobs and report its own conclusion, not the newer attempt's.
    if (pinned && pinned.attempt < run.attempt) {
      return { ...run, attempt: pinned.attempt, conclusion: pinned.conclusion };
    }
    return run;
  }

  async function resolveDefaultBranch(run: WorkflowRun): Promise<string> {
    if (run.repository.default_branch) return run.repository.default_branch;
    const { data } = await call(() => rest.repos.get(base));
    return data.default_branch;
  }

  function listAttemptJobs(attempt: number): Promise<Job[]> {
    return call(() =>
      octokit.paginate(rest.actions.listJobsForWorkflowRunAttempt, {
        ...base,
        run_id: runId,
        attempt_number: attempt,
        per_page: PER_PAGE,
      }),
    );
  }

  async function listJobs(): Promise<JobInfo[]> {
    const run = await getRun();
    return (await listAttemptJobs(run.attempt)).map(toJobInfo);
  }

  async function getJobLog(jobId: number): Promise<string> {
    try {
      // Octokit follows the 302 to the signed log URL; the body arrives as text or bytes.
      const response = await call(() =>
        rest.actions.downloadJobLogsForWorkflowRun({ ...base, job_id: jobId }),
      );
      return decodeText(response.data as unknown);
    } catch (error) {
      const status = httpStatus(error);
      if (status === 404 || status === 410) {
        throw new Error(`Logs for job ${jobId} are unavailable (expired or deleted)`, { cause: error });
      }
      throw error;
    }
  }

  async function getContent(path: string, ref: string) {
    const response = await nullIfNotFound(() => call(() => rest.repos.getContent({ ...base, path, ref })));
    return response?.data ?? null;
  }

  async function readFile(path: string, ref: string): Promise<string | null> {
    const normalized = normalizeRepoPath(path);
    if (!normalized) return null;
    const content = await getContent(normalized, ref);
    if (content === null || Array.isArray(content) || content.type !== "file") return null;
    if (content.content) return decodeContent(content.content, content.encoding);
    if (content.size === 0) return "";
    // The contents API omits the body of files over 1 MB; the blob API serves up to 100 MB.
    const { data: blob } = await call(() => rest.git.getBlob({ ...base, file_sha: content.sha }));
    return decodeContent(blob.content, blob.encoding);
  }

  async function listDirectory(path: string, ref: string): Promise<string[] | null> {
    const normalized = normalizeRepoPath(path);
    if (normalized === null) return null;
    const content = await getContent(normalized, ref);
    if (!Array.isArray(content)) return null;
    return content.map((entry) => (entry.type === "dir" ? `${entry.name}/` : entry.name)).sort();
  }

  async function getChangedFiles(): Promise<ChangedFile[]> {
    const run = await getRun();
    const pr = run.pullRequestNumbers[0] ?? (await findPullRequest(run));
    const files =
      pr === null ? await listCommitFiles(run.headSha) : await listPullRequestFilesAt(pr, run.headSha);
    return files.slice(0, MAX_CHANGED_FILES).map(toChangedFile);
  }

  /**
   * The PR's diff as of the failing commit. pulls.listFiles is the PR's *current* diff, which is
   * wrong once more commits were pushed after the failing run; then compare base...failing SHA.
   */
  async function listPullRequestFilesAt(pr: number, sha: string): Promise<DiffEntry[]> {
    const { data: pull } = await call(() => rest.pulls.get({ ...base, pull_number: pr }));
    if (pull.head.sha === sha) return listPullRequestFiles(pr);
    const { data } = await call(() =>
      rest.repos.compareCommitsWithBasehead({
        ...base,
        basehead: `${pull.base.sha}...${sha}`,
        per_page: 100,
      }),
    );
    return data.files ?? [];
  }

  function listPullRequestFiles(pr: number): Promise<DiffEntry[]> {
    return call(() => {
      let fetched = 0;
      return octokit.paginate(
        rest.pulls.listFiles,
        { ...base, pull_number: pr, per_page: PER_PAGE },
        (response, done) => {
          fetched += response.data.length;
          if (fetched >= MAX_CHANGED_FILES) done();
          return response.data;
        },
      );
    });
  }

  async function listCommitFiles(sha: string): Promise<DiffEntry[]> {
    const { data } = await call(() => rest.repos.getCommit({ ...base, ref: sha }));
    return data.files ?? [];
  }

  async function getJobHistory(jobName: string, limit: number): Promise<JobHistoryEntry[]> {
    const run = await getRun();
    const [attempts, defaultBranch] = await Promise.all([
      previousAttemptEntries(run, jobName),
      defaultBranchEntries(run, jobName, clamp(Math.floor(limit), 0, PER_PAGE - 1)),
    ]);
    return [...attempts, ...defaultBranch].sort(newestFirst);
  }

  async function previousAttemptEntries(run: RunInfo, jobName: string): Promise<JobHistoryEntry[]> {
    const attempts = Array.from({ length: Math.max(0, run.attempt - 1) }, (_, i) => i + 1);
    const entries = await mapSettled(attempts, HISTORY_CONCURRENCY, async (attempt) => {
      const job = (await listAttemptJobs(attempt)).find((j) => j.name === jobName);
      if (!job) return null;
      return {
        runId: run.id,
        attempt,
        headSha: run.headSha,
        branch: run.headBranch,
        event: run.event,
        conclusion: job.conclusion,
        createdAt: job.created_at,
        sameSha: true,
        htmlUrl: job.html_url ?? null,
      };
    });
    return entries.filter(isPresent);
  }

  async function defaultBranchEntries(
    run: RunInfo,
    jobName: string,
    limit: number,
  ): Promise<JobHistoryEntry[]> {
    if (limit === 0) return [];
    const { data } = await call(() =>
      rest.actions.listWorkflowRuns({
        ...base,
        workflow_id: run.workflowId,
        branch: run.defaultBranch,
        status: "completed",
        per_page: limit + 1, // one spare in case the current run is in the page
        exclude_pull_requests: true,
      }),
    );
    const runs = data.workflow_runs.filter((r) => Number(r.id) !== run.id && !isForkRun(r)).slice(0, limit);
    const entries = await mapSettled(runs, HISTORY_CONCURRENCY, async (other) => {
      const jobs = await call(() =>
        octokit.paginate(rest.actions.listJobsForWorkflowRun, {
          ...base,
          run_id: Number(other.id),
          filter: "latest",
          per_page: PER_PAGE,
        }),
      );
      const job = jobs.find((j) => j.name === jobName);
      if (!job) return null;
      return {
        runId: Number(other.id),
        attempt: other.run_attempt ?? 1,
        headSha: other.head_sha,
        branch: other.head_branch,
        event: other.event,
        conclusion: job.conclusion,
        createdAt: other.created_at,
        sameSha: other.head_sha === run.headSha,
        htmlUrl: job.html_url ?? other.html_url,
      };
    });
    return entries.filter(isPresent);
  }

  async function findPullRequest(run: RunInfo): Promise<number | null> {
    const known = run.pullRequestNumbers[0];
    if (known !== undefined) return known;
    try {
      const { data: associated } = await call(() =>
        rest.repos.listPullRequestsAssociatedWithCommit({ ...base, commit_sha: run.headSha }),
      );
      const open = associated.filter((pr) => pr.state === "open");
      // A push to one branch must not land its comment on another branch's PR that merely
      // contains the same commit, so only pull_request-style runs fall back to "any open PR".
      const match =
        open.find((pr) => pr.head.sha === run.headSha) ??
        open.find((pr) => pr.head.ref === run.headBranch) ??
        (run.event.startsWith("pull_request") ? open[0] : undefined);
      if (match) return match.number;

      // Commits that only exist in a fork are not associated with the base repo's PRs.
      const headOwner = run.headRepoFullName?.split("/")[0];
      if (!run.headBranch || !headOwner) return null;
      const { data: byBranch } = await call(() =>
        rest.pulls.list({ ...base, state: "open", head: `${headOwner}:${run.headBranch}`, per_page: 10 }),
      );
      return byBranch[0]?.number ?? null;
    } catch {
      return null;
    }
  }

  async function findComment(pr: number, marker: string): Promise<ExistingComment | null> {
    // A blank marker matches every comment, and upsertComment would then edit someone else's.
    if (marker.trim() === "") throw new Error("Comment marker must not be blank");
    const comments = await call(() =>
      octokit.paginate(rest.issues.listComments, { ...base, issue_number: pr, per_page: PER_PAGE }),
    );
    const matches = comments.filter((c) => isTrustedAuthor(c) && startsWithMarker(c.body ?? "", marker));
    const newest = matches.reduce<IssueComment | null>(
      (latest, c) =>
        latest === null || Date.parse(c.created_at) >= Date.parse(latest.created_at) ? c : latest,
      null,
    );
    return newest && { id: Number(newest.id), body: newest.body ?? "", htmlUrl: newest.html_url };
  }

  async function upsertComment(
    pr: number,
    marker: string,
    body: string,
  ): Promise<{ id: number; htmlUrl: string; created: boolean }> {
    const fullBody = startsWithMarker(body, marker) ? body : `${marker}\n${body}`;
    const existing = await findComment(pr, marker);
    if (existing) {
      const { data } = await call(() =>
        rest.issues.updateComment({ ...base, comment_id: existing.id, body: fullBody }),
      );
      return { id: Number(data.id), htmlUrl: data.html_url, created: false };
    }
    // A POST that failed with a 5xx may still have landed; only retry when GitHub
    // explicitly rejected it (rate limit), so a flaky response cannot double-post.
    const { data } = await withRetry(
      () => rest.issues.createComment({ ...base, issue_number: pr, body: fullBody }),
      sleep,
      isRateLimited,
    );
    return { id: Number(data.id), htmlUrl: data.html_url, created: true };
  }

  return {
    repo: base,
    getRun,
    listJobs,
    getJobLog,
    readFile,
    listDirectory,
    getChangedFiles,
    getJobHistory,
    findPullRequest,
    findComment,
    upsertComment,
  };
}

// ---------------------------------------------------------------------------
// Normalization
// ---------------------------------------------------------------------------

function toRunInfo(run: WorkflowRun, defaultBranch: string): RunInfo {
  const workflowPath = stripRefSuffix(run.path);
  const headRepoFullName = run.head_repository?.full_name ?? null;
  return {
    id: Number(run.id),
    attempt: run.run_attempt ?? 1,
    workflowId: run.workflow_id,
    workflowName: run.name ?? workflowPath ?? "",
    workflowPath,
    event: run.event,
    headBranch: run.head_branch,
    headSha: run.head_sha,
    headRepoFullName,
    isFork: headRepoFullName !== null && !sameRepoName(headRepoFullName, run.repository.full_name),
    defaultBranch,
    conclusion: run.conclusion,
    htmlUrl: run.html_url,
    displayTitle: run.display_title ?? null,
    // GitHub can list PRs that belong to another repository (e.g. a fork's run lists the
    // upstream PR it feeds); only PRs into this repository can be commented on here.
    pullRequestNumbers: (run.pull_requests ?? [])
      .filter((pr) => Number(pr.base.repo.id) === Number(run.repository.id))
      .map((pr) => pr.number),
    createdAt: run.created_at,
  };
}

/** ".github/workflows/ci.yml@refs/heads/main" -> ".github/workflows/ci.yml" */
function stripRefSuffix(path: string | null | undefined): string | null {
  const withoutRef = path?.split("@", 1)[0]?.trim();
  return withoutRef ? withoutRef : null;
}

/**
 * A pull_request run from a fork whose branch is also called e.g. "main" matches the
 * default-branch filter; its outcome says nothing about the default branch.
 */
function isForkRun(run: WorkflowRun): boolean {
  const head = run.head_repository?.full_name;
  return head !== undefined && !sameRepoName(head, run.repository.full_name);
}

function sameRepoName(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase();
}

function toJobInfo(job: Job): JobInfo {
  return {
    id: Number(job.id),
    name: job.name,
    status: job.status,
    conclusion: job.conclusion,
    startedAt: job.started_at ?? null,
    completedAt: job.completed_at ?? null,
    runnerLabels: job.labels ?? [],
    htmlUrl: job.html_url ?? null,
    steps: (job.steps ?? []).map((step): StepInfo => ({
      number: step.number,
      name: step.name,
      status: step.status,
      conclusion: step.conclusion,
      startedAt: step.started_at ?? null,
      completedAt: step.completed_at ?? null,
    })),
  };
}

function toChangedFile(file: DiffEntry): ChangedFile {
  return {
    path: file.filename,
    status: file.status,
    additions: file.additions,
    deletions: file.deletions,
    patch: file.patch ?? null,
    previousPath: file.previous_filename ?? null,
  };
}

function newestFirst(a: JobHistoryEntry, b: JobHistoryEntry): number {
  return Date.parse(b.createdAt) - Date.parse(a.createdAt) || b.runId - a.runId || b.attempt - a.attempt;
}

function startsWithMarker(body: string, marker: string): boolean {
  return body.trimStart().startsWith(marker);
}

const TRUSTED_ASSOCIATIONS: ReadonlySet<string> = new Set(["OWNER", "MEMBER", "COLLABORATOR"]);

/**
 * The marker is public, and anyone can comment on a public PR. Editing an outsider's marker
 * comment would publish the triage under their name, where they can rewrite it later. Our own
 * comments come from a bot (GITHUB_TOKEN, app tokens) or a collaborator's PAT.
 */
function isTrustedAuthor(comment: IssueComment): boolean {
  return comment.user?.type === "Bot" || TRUSTED_ASSOCIATIONS.has(comment.author_association ?? "");
}

/** "https:", "file:", "C:" — a scheme or drive prefix is never a repository path. */
const SCHEME_OR_DRIVE = /^[a-z][a-z0-9+.-]*:/i;

/**
 * Repository-relative path for the contents API, or null when the input could escape the
 * repository (".." segments) or is not a repository path at all. "", "." and "/" mean the root.
 */
export function normalizeRepoPath(input: string): string | null {
  const path = input.trim().replace(/\\/g, "/");
  if (path.includes("\0") || SCHEME_OR_DRIVE.test(path)) return null;
  const segments = path.split("/").filter((segment) => segment !== "" && segment !== ".");
  return segments.includes("..") ? null : segments.join("/");
}

function decodeContent(content: string, encoding: string): string {
  return encoding === "base64" ? Buffer.from(content, "base64").toString("utf8") : content;
}

const utf8 = new TextDecoder("utf-8");
const UTF8_BOM = "\uFEFF";

/** Log bodies arrive as a string or raw bytes depending on the response content type. */
function decodeText(data: unknown): string {
  let text: string;
  if (typeof data === "string") text = data;
  else if (data instanceof ArrayBuffer) text = utf8.decode(new Uint8Array(data));
  else if (ArrayBuffer.isView(data))
    text = utf8.decode(new Uint8Array(data.buffer, data.byteOffset, data.byteLength));
  // Octokit turns a body that failed mid-download into undefined (an empty body is ""), so
  // this is a broken transfer, not an empty log.
  else if (data === null || data === undefined) throw new Error("Log download returned no body");
  else throw new TypeError(`Unexpected log payload of type ${typeof data}`);
  return text.startsWith(UTF8_BOM) ? text.slice(1) : text;
}

// ---------------------------------------------------------------------------
// Resilience
// ---------------------------------------------------------------------------

async function withRetry<T>(
  operation: () => Promise<T>,
  sleep: Sleep,
  shouldRetry: (error: unknown) => boolean,
): Promise<T> {
  for (let retry = 0; ; retry++) {
    try {
      return await operation();
    } catch (error) {
      if (retry >= MAX_RETRIES || !shouldRetry(error)) throw error;
      await sleep(retryDelayMs(error, retry));
    }
  }
}

function isTransient(error: unknown): boolean {
  const status = httpStatus(error);
  return (status !== null && status >= 500) || isRateLimited(error);
}

function isRateLimited(error: unknown): boolean {
  const status = httpStatus(error);
  if (status === 429) return true;
  if (status !== 403) return false;
  // A 403 is a permission error unless GitHub flags it as a secondary rate limit. Primary
  // rate limits (also 403) reset on the hour, so a short backoff would not help them.
  const message = error instanceof Error ? error.message : "";
  return /secondary rate limit/i.test(message) || responseHeader(error, "retry-after") !== null;
}

function retryDelayMs(error: unknown, retry: number): number {
  const retryAfterSeconds = Number(responseHeader(error, "retry-after"));
  if (Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0) {
    return Math.min(retryAfterSeconds * 1_000, MAX_BACKOFF_MS);
  }
  return BASE_BACKOFF_MS * 2 ** retry;
}

async function nullIfNotFound<T>(operation: () => Promise<T>): Promise<T | null> {
  try {
    return await operation();
  } catch (error) {
    if (httpStatus(error) === 404) return null;
    throw error;
  }
}

/** Status of an Octokit RequestError (duck-typed: the class is not a direct dependency). */
function httpStatus(error: unknown): number | null {
  if (typeof error === "object" && error !== null && "status" in error && typeof error.status === "number") {
    return error.status;
  }
  return null;
}

function responseHeader(error: unknown, name: string): string | null {
  if (typeof error !== "object" || error === null || !("response" in error)) return null;
  const { response } = error;
  if (typeof response !== "object" || response === null || !("headers" in response)) return null;
  const { headers } = response;
  if (typeof headers !== "object" || headers === null) return null;
  const value: unknown = (headers as Record<string, unknown>)[name];
  return value === undefined || value === null ? null : String(value);
}

// ---------------------------------------------------------------------------
// Small utilities
// ---------------------------------------------------------------------------

/** Maps `items` with at most `concurrency` tasks in flight; a failed task yields null. */
async function mapSettled<T, R>(
  items: readonly T[],
  concurrency: number,
  task: (item: T) => Promise<R | null>,
): Promise<Array<R | null>> {
  const results: Array<R | null> = items.map(() => null);
  const queue = items.entries();
  const worker = async (): Promise<void> => {
    // Workers share one iterator, so each item is taken exactly once.
    for (const [index, item] of queue) {
      try {
        results[index] = await task(item);
      } catch {
        results[index] = null;
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
  return results;
}

function isPresent<T>(value: T | null): value is T {
  return value !== null;
}

function clamp(value: number, min: number, max: number): number {
  return Number.isNaN(value) ? min : Math.min(Math.max(value, min), max);
}
