import { betaZodTool } from "@anthropic-ai/sdk/helpers/beta/zod";
import type { BetaRunnableTool } from "@anthropic-ai/sdk/lib/tools/BetaRunnableTool";
import { z } from "zod";
import { parseJobLog } from "../logs.js";
import { redactSecrets } from "../redact.js";
import type {
  AgentLogger,
  JobHistoryEntry,
  JobInfo,
  LogSearchResult,
  LogView,
  NumberedLine,
  RunInfo,
  ToolCallTrace,
  TriageBackend,
  TriageContext,
} from "../types.js";
import { formatNumberedLines, sliceCodePoints } from "./prompt.js";

// Every tool is read-only. Situations the model can correct (unknown job, missing file,
// line out of range) come back as plain explanatory text. Only real failures throw: the
// tool runner turns a thrown error into an `is_error` tool_result reading "Error: <message>",
// so the model sees it and the loop keeps going.

/** Default cap for one tool result; every turn re-sends all earlier results. */
export const MAX_TOOL_RESULT_CHARS = 12_000;
/** Source files are denser in useful detail than logs, so read_file gets a larger cap. */
export const MAX_FILE_RESULT_CHARS = 40_000;
const MAX_LINES_PER_READ = 400;
const MAX_FILE_LINE_CHARS = 1_000;
const MAX_DIRECTORY_ENTRIES = 300;
const MAX_LISTED_NAMES = 50;
const DEFAULT_HISTORY = 10;
const MAX_HISTORY = 20;
const SHORT_SHA_LENGTH = 7;

export interface ToolDeps {
  ctx: TriageContext;
  backend: TriageBackend;
  logger?: AgentLogger;
  onCall?: (trace: Omit<ToolCallTrace, "turn">) => void;
  /** Gate checked before every call: return a reason to refuse it (for example a per-turn cap), or null. */
  admit?: (toolName: string) => string | null;
}

// ---------------------------------------------------------------------------
// Input schemas
// ---------------------------------------------------------------------------

const jobRef = z
  .string()
  .describe(
    'A job of this run: its exact name (e.g. "test (ubuntu-latest, 20)"), the name in any case, or its numeric id written as a string (e.g. "123456789").',
  );
const ref = z
  .enum(["head", "default_branch"])
  .optional()
  .describe(
    '"head" (default) is the commit that failed; "default_branch" shows the version before the change.',
  );

const SearchLogInput = z.object({
  job: jobRef,
  pattern: z.string().describe("Text to find. A literal substring unless regex is true."),
  regex: z.boolean().optional().describe("Treat pattern as a JavaScript regular expression. Default false."),
  case_sensitive: z.boolean().optional().describe("Default false."),
  context: z.int().optional().describe("Lines of context before and after each match. Default 3, max 20."),
  max_matches: z.int().optional().describe("Matches to show. Default 20, max 50."),
  step: z.int().optional().describe("Only search lines attributed to this step number."),
});

const ReadLogInput = z.object({
  job: jobRef,
  start_line: z.int().describe("First line to read (1-based, inclusive)."),
  end_line: z.int().describe(`Last line to read (inclusive). At most ${MAX_LINES_PER_READ} lines per call.`),
});

const ReadFileInput = z.object({
  path: z.string().describe("Repository-relative file path, e.g. src/app.ts or .github/workflows/ci.yml."),
  start_line: z.int().optional().describe("First line (1-based). Default 1."),
  end_line: z
    .int()
    .optional()
    .describe(`Last line (inclusive). At most ${MAX_LINES_PER_READ} lines per call.`),
  ref,
});

const ListDirectoryInput = z.object({
  path: z.string().describe('Repository-relative directory path; "" or "." for the repository root.'),
  ref,
});

const GetFileDiffInput = z.object({
  path: z.string().describe("Path of a changed file, as listed under Changed files."),
});

const GetJobHistoryInput = z.object({
  job: jobRef,
  limit: z.int().optional().describe(`Entries to fetch. Default ${DEFAULT_HISTORY}, max ${MAX_HISTORY}.`),
});

export type TriageTool =
  | BetaRunnableTool<z.infer<typeof SearchLogInput>>
  | BetaRunnableTool<z.infer<typeof ReadLogInput>>
  | BetaRunnableTool<z.infer<typeof ReadFileInput>>
  | BetaRunnableTool<z.infer<typeof ListDirectoryInput>>
  | BetaRunnableTool<z.infer<typeof GetFileDiffInput>>
  | BetaRunnableTool<z.infer<typeof GetJobHistoryInput>>;

// ---------------------------------------------------------------------------
// Tools
// ---------------------------------------------------------------------------

export function createTools(deps: ToolDeps): TriageTool[] {
  const { ctx, backend } = deps;
  const logs = createLogStore(ctx, backend);

  return [
    defineTool(deps, {
      name: "search_log",
      description:
        "Search one job's log for a literal substring (or a regular expression) and return the matching lines with " +
        "context, numbered exactly as in the excerpts. Use it to find the first occurrence of an error, an error code, " +
        "a failing test name or a file path that the excerpt only hints at. Works for every job of the run, " +
        "including jobs that passed.",
      input: SearchLogInput,
      run: async (input) => {
        const job = resolveJob(ctx, input.job);
        if (!job) return unknownJobMessage(ctx, input.job);
        const view = await logs.get(job);
        if (typeof view === "string") return view;
        if (input.pattern.trim() === "")
          return "The pattern is empty. Search for an error message, code or file name.";
        const result = view.search(input.pattern, {
          regex: input.regex ?? false,
          caseSensitive: input.case_sensitive ?? false,
          context: clamp(input.context ?? 3, 0, 20),
          maxMatches: clamp(input.max_matches ?? 20, 1, 50),
          ...(input.step !== undefined && { step: input.step }),
        });
        return renderSearch(job, view, input.pattern, result);
      },
    }),

    defineTool(deps, {
      name: "read_log",
      description:
        `Read a range of numbered lines (at most ${MAX_LINES_PER_READ} per call) from one job's log. Use it to see ` +
        "what happened before or after an excerpt or a search match, e.g. the first error in a long failing step.",
      input: ReadLogInput,
      run: async (input) => {
        const job = resolveJob(ctx, input.job);
        if (!job) return unknownJobMessage(ctx, input.job);
        const view = await logs.get(job);
        if (typeof view === "string") return view;
        return renderLogSlice(job, view, input.start_line, input.end_line);
      },
    }),

    defineTool(deps, {
      name: "read_file",
      description:
        "Read a repository file as numbered lines (at most 400 lines per call), at the failing commit (default) or " +
        'at the default branch. Use it to inspect the code, test, config or workflow file an error points at; read it at ref "default_branch" to see the version before the change.',
      input: ReadFileInput,
      maxChars: MAX_FILE_RESULT_CHARS,
      run: async (input) => {
        const path = normalizeRepoPath(input.path);
        if (!path) return `"${input.path}" is not a repository-relative file path.`;
        const at = resolveRef(ctx.run, input.ref);
        const content = await backend.readFile(path, at.ref);
        if (content === null) {
          return `File not found at ${at.label}: ${path}. Use list_directory to check the path.`;
        }
        return renderFile(path, at.label, content, input.start_line, input.end_line);
      },
    }),

    defineTool(deps, {
      name: "list_directory",
      description:
        "List the entries of a repository directory (sub-directories end with /), at the failing commit (default) " +
        "or at the default branch. Use it to find the right path when read_file reports a file as not found.",
      input: ListDirectoryInput,
      run: async (input) => {
        const path = normalizeRepoPath(input.path === "." ? "" : input.path);
        if (path === null) return `"${input.path}" is not a repository-relative directory path.`;
        const at = resolveRef(ctx.run, input.ref);
        const entries = await backend.listDirectory(path, at.ref);
        if (entries === null) return `Directory not found at ${at.label}: ${path || "/"}`;
        return renderDirectory(path, at.label, entries);
      },
    }),

    defineTool(deps, {
      name: "get_file_diff",
      description:
        "Return the unified diff of one file changed by this run's pull request or commit. Use it to connect an " +
        "error to the exact lines that changed.",
      input: GetFileDiffInput,
      run: async (input) => renderDiff(ctx, normalizeRepoPath(input.path) ?? input.path),
    }),

    defineTool(deps, {
      name: "get_job_history",
      description:
        "Show recent outcomes of a job, newest first: other attempts of the same commit and recent runs on the " +
        "default branch, with a one-line pass/fail summary. Use it when the failure looks unrelated to the diff, to " +
        "judge whether it is flaky or already broken on the default branch.",
      input: GetJobHistoryInput,
      run: async (input) => {
        const job = resolveJob(ctx, input.job);
        if (!job) return unknownJobMessage(ctx, input.job);
        const entries = await backend.getJobHistory(
          job.name,
          clamp(input.limit ?? DEFAULT_HISTORY, 1, MAX_HISTORY),
        );
        return renderHistory(job, ctx.run, entries);
      },
    }),
  ];
}

// ---------------------------------------------------------------------------
// Tool plumbing: validation, tracing, result caps
// ---------------------------------------------------------------------------

interface ToolSpec<Schema extends z.ZodObject> {
  name: string;
  description: string;
  input: Schema;
  maxChars?: number;
  run: (input: z.infer<Schema>) => Promise<string>;
}

function defineTool<Schema extends z.ZodObject>(
  deps: ToolDeps,
  spec: ToolSpec<Schema>,
): BetaRunnableTool<z.infer<Schema>> {
  const maxChars = spec.maxChars ?? MAX_TOOL_RESULT_CHARS;
  const tool = betaZodTool({
    name: spec.name,
    description: spec.description,
    inputSchema: spec.input,
    run: async (input: z.infer<Schema>) => {
      const started = performance.now();
      const refused = deps.admit?.(spec.name) ?? null;
      if (refused !== null) {
        record(deps, { name: spec.name, input, ok: false, resultChars: refused.length, durationMs: 0 });
        throw new Error(refused);
      }
      try {
        const result = capResult(await spec.run(input), maxChars);
        record(deps, {
          name: spec.name,
          input,
          ok: true,
          resultChars: result.length,
          durationMs: since(started),
        });
        return result;
      } catch (error) {
        // A transport error can carry a whole HTML error page; it is a tool result like any other.
        const message = capResult(`${spec.name} failed: ${errorMessage(error)}`, maxChars);
        record(deps, {
          name: spec.name,
          input,
          ok: false,
          resultChars: message.length,
          durationMs: since(started),
        });
        throw new Error(message, { cause: error });
      }
    },
  });

  return {
    ...tool,
    // The runner validates input before run(); wrapping parse() keeps malformed calls in the trace too.
    parse: (raw: unknown) => {
      const parsed = spec.input.safeParse(raw);
      if (parsed.success) return parsed.data;
      const message = `invalid input for ${spec.name}:\n${z.prettifyError(parsed.error)}`;
      record(deps, { name: spec.name, input: raw, ok: false, resultChars: message.length, durationMs: 0 });
      throw new Error(message);
    },
  };
}

function record(deps: ToolDeps, call: Omit<ToolCallTrace, "turn">): void {
  deps.onCall?.(call);
  deps.logger?.debug(
    `tool ${call.name} ${JSON.stringify(call.input)} -> ${call.ok ? "ok" : "error"}, ` +
      `${call.resultChars} chars, ${call.durationMs} ms`,
  );
}

/** Cut an oversized result at a line boundary and say so, so the model narrows the request. */
export function capResult(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  const note =
    `\n[truncated: the result exceeded ${maxChars} characters. ` +
    "Narrow the request (a smaller line range or a more specific pattern).]";
  const room = Math.max(0, maxChars - note.length);
  const lineEnd = text.lastIndexOf("\n", room);
  return sliceCodePoints(text, lineEnd > room / 2 ? lineEnd : room) + note;
}

function since(started: number): number {
  return Math.round(performance.now() - started);
}

/** Tool errors are shown to the model, so they are redacted like any other tool output. */
function errorMessage(error: unknown): string {
  return redactSecrets(error instanceof Error ? error.message : String(error)).text;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.trunc(value)));
}

// ---------------------------------------------------------------------------
// Jobs and logs
// ---------------------------------------------------------------------------

/** Exact name, then case-insensitive name, then numeric id. */
function resolveJob(ctx: TriageContext, reference: string): JobInfo | null {
  const wanted = reference.trim();
  const jobs = knownJobs(ctx);
  const lower = wanted.toLowerCase();
  return (
    jobs.find((job) => job.name === wanted) ??
    jobs.find((job) => job.name.toLowerCase() === lower) ??
    (/^\d+$/.test(wanted) ? jobs.find((job) => job.id === Number(wanted)) : undefined) ??
    null
  );
}

function knownJobs(ctx: TriageContext): JobInfo[] {
  const jobs = [...ctx.allJobs];
  for (const { job } of ctx.failedJobs) {
    if (!jobs.some((known) => known.id === job.id)) jobs.push(job);
  }
  return jobs;
}

function unknownJobMessage(ctx: TriageContext, reference: string): string {
  const names = knownJobs(ctx).map((job) => `"${job.name}"`);
  const listed = names.slice(0, MAX_LISTED_NAMES).join(", ");
  const more = names.length > MAX_LISTED_NAMES ? ` and ${names.length - MAX_LISTED_NAMES} more` : "";
  return `No job "${reference}" in this run. Available jobs: ${listed || "none"}${more}.`;
}

interface LogStore {
  /** The job's log, or a message explaining why it is unavailable. Throws on transport errors. */
  get(job: JobInfo): Promise<LogView | string>;
}

/** Logs of the excerpted failed jobs are already parsed; any other job's log is fetched once, on first use. */
function createLogStore(ctx: TriageContext, backend: TriageBackend): LogStore {
  const fetched = new Map<number, Promise<LogView>>();
  return {
    async get(job) {
      const failed = ctx.failedJobs.find((candidate) => candidate.job.id === job.id);
      if (failed?.log) return failed.log;
      if (failed?.logError) return `The log of job "${job.name}" is unavailable: ${failed.logError}`;
      let pending = fetched.get(job.id);
      if (!pending) {
        const download = backend.getJobLog(job.id).then((raw) => parseJobLog(raw, job));
        fetched.set(job.id, download);
        // A failed download (often transient) must not stay cached: the next call tries again.
        download.catch(() => {
          if (fetched.get(job.id) === download) fetched.delete(job.id);
        });
        pending = download;
      }
      return pending;
    },
  };
}

function renderSearch(job: JobInfo, view: LogView, pattern: string, result: LogSearchResult): string {
  const notes = result.note ? [`Note: ${result.note}`] : [];
  if (result.totalMatches === 0) {
    return [
      ...notes,
      `No matches for ${JSON.stringify(pattern)} in job "${job.name}" (${view.lineCount} lines). ` +
        "Try a shorter or different pattern, or read_log around the excerpt.",
    ].join("\n");
  }
  // Context windows of nearby matches overlap; show each line once and flag the matches.
  const byNumber = new Map<number, NumberedLine>();
  for (const match of result.matches) {
    for (const line of match.context) byNumber.set(line.n, line);
  }
  const lines = [...byNumber.values()].sort((a, b) => a.n - b.n);
  const marked = new Set(result.matches.map((match) => match.line));
  const shown = result.truncated ? ` (showing the first ${result.matches.length})` : "";
  return [
    `Job "${job.name}": ${result.totalMatches} matches for ${JSON.stringify(pattern)}${shown}. Matching lines start with ">".`,
    ...notes,
    formatNumberedLines(lines, { marked }),
  ].join("\n");
}

function renderLogSlice(job: JobInfo, view: LogView, startLine: number, endLine: number): string {
  if (endLine < startLine) return "end_line must not be smaller than start_line.";
  if (startLine > view.lineCount) return `Job "${job.name}" has only ${view.lineCount} log lines.`;
  const start = Math.max(1, startLine);
  const end = Math.min(endLine, start + MAX_LINES_PER_READ - 1, view.lineCount);
  if (end < start) return `No log lines in ${startLine}-${endLine}; lines are numbered from 1.`;
  const lines = view.slice(start, end);
  const more = end < Math.min(endLine, view.lineCount) ? `; call again from line ${end + 1} for more` : "";
  return [
    `Job "${job.name}", lines ${start}-${end} of ${view.lineCount}${more}:`,
    formatNumberedLines(lines),
  ].join("\n");
}

// ---------------------------------------------------------------------------
// Repository files and diffs
// ---------------------------------------------------------------------------

/** Strip "./" and slashes at the ends; null for anything that climbs out of the repository. */
export function normalizeRepoPath(path: string): string | null {
  const trimmed = path
    .trim()
    .replace(/^(\.\/)+/, "")
    .replace(/^\/+/, "")
    .replace(/\/+$/, "");
  if (trimmed.split("/").some((segment) => segment === "..")) return null;
  return trimmed;
}

function resolveRef(
  run: RunInfo,
  which: "head" | "default_branch" | undefined,
): { ref: string; label: string } {
  return which === "default_branch"
    ? { ref: run.defaultBranch, label: `default branch (${run.defaultBranch})` }
    : { ref: run.headSha, label: `head (${run.headSha.slice(0, SHORT_SHA_LENGTH)})` };
}

function renderFile(
  path: string,
  label: string,
  content: string,
  startLine: number | undefined,
  endLine: number | undefined,
): string {
  if (path === "") return "A file path is required.";
  if (content.includes("\u0000")) return `${path} at ${label} looks like a binary file; not shown.`;
  const all = content.split(/\r?\n/);
  if (all.at(-1) === "") all.pop();
  if (all.length === 0) return `${path} at ${label} is empty.`;
  if ((startLine ?? 1) > all.length) return `${path} at ${label} has only ${all.length} lines.`;

  const start = clamp(startLine ?? 1, 1, all.length);
  const end = clamp(Math.min(endLine ?? all.length, start + MAX_LINES_PER_READ - 1), start, all.length);
  const lines = all.slice(start - 1, end).map((text, i) => ({ n: start + i, text }));
  const more = end < all.length ? `; call again with start_line=${end + 1} for more` : "";
  return [
    `${path} at ${label}, lines ${start}-${end} of ${all.length}${more}:`,
    formatNumberedLines(lines, { maxLineChars: MAX_FILE_LINE_CHARS }),
  ].join("\n");
}

function renderDirectory(path: string, label: string, entries: readonly string[]): string {
  if (entries.length === 0) return `${path || "/"} at ${label} is empty.`;
  const sorted = [...entries].sort();
  const shown = sorted.slice(0, MAX_DIRECTORY_ENTRIES);
  const more = sorted.length - shown.length;
  return [
    `${path || "/"} at ${label} (${entries.length} entries):`,
    ...shown,
    ...(more > 0 ? [`... and ${more} more`] : []),
  ].join("\n");
}

function renderDiff(ctx: TriageContext, path: string): string {
  const file =
    ctx.changedFiles.find((changed) => changed.path === path) ??
    ctx.changedFiles.find((changed) => changed.previousPath === path);
  if (!file) {
    const listed = ctx.changedFiles.slice(0, MAX_LISTED_NAMES).map((changed) => changed.path);
    const more =
      ctx.changedFiles.length > listed.length ? ` and ${ctx.changedFiles.length - listed.length} more` : "";
    const known =
      listed.length > 0
        ? ` Changed files: ${listed.join(", ")}${more}.`
        : " No changed files are known for this run.";
    const error = ctx.changedFilesError
      ? ` (Changed files could not be fully loaded: ${ctx.changedFilesError})`
      : "";
    return `${path} was not changed in this run.${known}${error}`;
  }
  const renamed = file.previousPath ? ` (renamed from ${file.previousPath})` : "";
  const header = `${file.status} ${file.path}${renamed} (+${file.additions}/-${file.deletions})`;
  if (file.patch === null) {
    return `${header}: no patch available (binary or too large). Use read_file to inspect it.`;
  }
  return `${header}\n${file.patch}`;
}

// ---------------------------------------------------------------------------
// Job history
// ---------------------------------------------------------------------------

function renderHistory(job: JobInfo, run: RunInfo, entries: readonly JobHistoryEntry[]): string {
  if (entries.length === 0) return `No recent history found for job "${job.name}".`;
  const isThisRun = (entry: JobHistoryEntry) => entry.runId === run.id && entry.attempt === run.attempt;
  const rows = entries.map((entry) => {
    const note = isThisRun(entry) ? "this run" : entry.sameSha ? "same commit" : "";
    return (
      `| ${entry.runId} | ${entry.attempt} | ${entry.headSha.slice(0, SHORT_SHA_LENGTH)} | ${entry.branch ?? "-"} | ` +
      `${entry.event} | ${entry.conclusion ?? "-"} | ${entry.createdAt} | ${note} |`
    );
  });
  return [
    `History of job "${job.name}", newest first.`,
    summarizeHistory(
      entries.filter((entry) => !isThisRun(entry)),
      run.defaultBranch,
    ),
    "| run | attempt | commit | branch | event | conclusion | created | note |",
    "| --- | --- | --- | --- | --- | --- | --- | --- |",
    ...rows,
  ].join("\n");
}

/** One line a model can act on: does the job pass elsewhere, and does it pass on a retry of this commit? */
function summarizeHistory(entries: readonly JobHistoryEntry[], defaultBranch: string): string {
  const sameCommit = entries.filter((entry) => entry.sameSha);
  const onDefault = entries.filter((entry) => !entry.sameSha && entry.branch === defaultBranch);
  const defaultPart =
    onDefault.length > 0
      ? `default branch (${defaultBranch}): ${tally(onDefault)} of the last ${onDefault.length} runs`
      : `default branch (${defaultBranch}): no recent runs`;
  const samePart =
    sameCommit.length > 0
      ? `same commit: ${tally(sameCommit)} of ${sameCommit.length} other attempts`
      : "same commit: no other attempts";
  return `Summary: ${defaultPart}; ${samePart}.`;
}

function tally(entries: readonly JobHistoryEntry[]): string {
  const passed = entries.filter((entry) => entry.conclusion === "success").length;
  const failed = entries.filter((entry) => entry.conclusion === "failure").length;
  const other = entries.length - passed - failed;
  return `${passed} passed, ${failed} failed${other > 0 ? `, ${other} other` : ""}`;
}
