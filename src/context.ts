/**
 * Builds the initial triage context: the run, its failed jobs with parsed logs, excerpts and
 * signature hits, and the changed files. Per-job and changed-file failures are recorded on
 * the context instead of thrown, so one expired log never prevents a triage of the rest.
 */
import { extractExcerpt, failedStepsOf, parseJobLog } from "./logs.js";
import { redactSecrets } from "./redact.js";
import { matchSignatures } from "./signatures.js";
import type {
  AgentLogger,
  ChangedFile,
  FailedJobContext,
  JobInfo,
  TriageBackend,
  TriageContext,
} from "./types.js";

export interface BuildContextOptions {
  /** Default 4. */
  maxFailedJobs?: number;
  /** Per failed job. Default 160. */
  excerptMaxLines?: number;
  logger?: AgentLogger;
}

const DEFAULT_MAX_FAILED_JOBS = 4;
const LOG_FETCH_CONCURRENCY = 4;

/** failure explains more than timed_out, which explains more than cancelled. */
const CONCLUSION_RANK: Readonly<Record<string, number>> = { failure: 0, timed_out: 1, cancelled: 2 };

/** Deterministic pre-processing: everything the agent sees before its first tool call. */
export async function buildContext(
  backend: TriageBackend,
  opts: BuildContextOptions = {},
): Promise<TriageContext> {
  const run = await backend.getRun();
  const jobs = await backend.listJobs();
  const failed = selectFailedJobs(jobs);
  const requested = opts.maxFailedJobs ?? DEFAULT_MAX_FAILED_JOBS;
  // NaN would make slice() keep no job at all; fall back to the default instead.
  const cap = Number.isNaN(requested) ? DEFAULT_MAX_FAILED_JOBS : Math.max(1, Math.floor(requested));

  const [failedJobs, changed] = await Promise.all([
    mapWithConcurrency(failed.slice(0, cap), LOG_FETCH_CONCURRENCY, (job) =>
      loadFailedJob(backend, job, opts),
    ),
    loadChangedFiles(backend, opts.logger),
  ]);

  const context: TriageContext = {
    run,
    failedJobs,
    omittedFailedJobs: failed.slice(cap).map((job) => job.name),
    allJobs: jobs,
    changedFiles: changed.files,
  };
  if (changed.error !== undefined) context.changedFilesError = changed.error;
  return context;
}

/**
 * Failed and timed-out jobs (cancelled ones only when nothing else failed, since a
 * cancellation is usually a consequence), most informative first. Among equals the job
 * that finished first leads: later failures are often fallout from it.
 */
export function selectFailedJobs(jobs: readonly JobInfo[]): JobInfo[] {
  const failing = jobs.filter((job) => job.conclusion === "failure" || job.conclusion === "timed_out");
  const pool = failing.length > 0 ? failing : jobs.filter((job) => job.conclusion === "cancelled");
  return pool.sort((a, b) => conclusionRank(a) - conclusionRank(b) || completedMs(a) - completedMs(b));
}

function conclusionRank(job: JobInfo): number {
  return CONCLUSION_RANK[job.conclusion ?? ""] ?? Number.MAX_SAFE_INTEGER;
}

/** Jobs without a completion time sort last. */
function completedMs(job: JobInfo): number {
  const ms = job.completedAt === null ? Number.NaN : Date.parse(job.completedAt);
  return Number.isNaN(ms) ? Number.MAX_SAFE_INTEGER : ms;
}

async function loadFailedJob(
  backend: TriageBackend,
  job: JobInfo,
  opts: BuildContextOptions,
): Promise<FailedJobContext> {
  const failedSteps = failedStepsOf(job);
  try {
    const log = parseJobLog(await backend.getJobLog(job.id), job);
    const excerpt = extractExcerpt(log, job, { maxLines: opts.excerptMaxLines });
    return { job, failedSteps, log, excerpt, signatures: matchSignatures(log) };
  } catch (error) {
    const message = errorMessage(error);
    opts.logger?.warning(`Could not load the log of job "${job.name}" (${job.id}): ${message}`);
    return { job, failedSteps, log: null, excerpt: null, signatures: [], logError: message };
  }
}

async function loadChangedFiles(
  backend: TriageBackend,
  logger: AgentLogger | undefined,
): Promise<{ files: ChangedFile[]; error?: string }> {
  try {
    return { files: await backend.getChangedFiles() };
  } catch (error) {
    const message = errorMessage(error);
    logger?.warning(`Could not list the changed files: ${message}`);
    return { files: [], error: message };
  }
}

/** Maps `items` with at most `limit` calls in flight, preserving order. */
async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  task: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array<R>(items.length);
  const queue = items.entries();
  const worker = async (): Promise<void> => {
    // Workers share one iterator, so each item is taken exactly once.
    for (const [index, item] of queue) results[index] = await task(item);
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

/** Error text ends up in the agent's context, so it goes through the redactor like everything else. */
function errorMessage(error: unknown): string {
  return redactSecrets(error instanceof Error ? error.message : String(error)).text;
}
