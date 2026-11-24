/**
 * Evidence grading: checks that every quote a triage result cites exists where the agent could have seen
 * it. Logs are re-parsed from the same redacting backend the agent used, so line numbers and redaction
 * markers match what it was shown. This is a separate metric: it never decides whether a case passes.
 */
import { parseJobLog, stripAnsi } from "../src/logs.js";
import type {
  ChangedFile,
  JobInfo,
  LogView,
  TriageBackend,
  TriageEvidence,
  TriageResult,
} from "../src/types.js";

/**
 * - verified:  a log quote found at the cited job and line; a file quote found at the cited line of the
 *              file the `job` field names; or a quote without a line found in any log, diff or file
 * - misplaced: the quote exists, but not at the cited line (another line, another job's log, or a file)
 * - not_found: the quote appears nowhere the agent could have read it
 */
export type EvidenceVerdict = "verified" | "misplaced" | "not_found";

export interface EvidenceCheck {
  job: string;
  line: number | null;
  excerpt: string;
  verdict: EvidenceVerdict;
  /** Where the quote was found ("log test:214", "diff src/a.ts:12", "file src/a.ts:3"); null when not found. */
  foundAt: string | null;
}

export interface EvidenceCounts {
  total: number;
  verified: number;
  misplaced: number;
  notFound: number;
}

export interface EvidenceGrade extends EvidenceCounts {
  items: EvidenceCheck[];
}

/** Everything the agent could quote from: job logs, the diff and the repository files. */
export interface EvidenceSources {
  jobs: readonly JobInfo[];
  /** The parsed log of a job, or null when it is unavailable. */
  log(job: JobInfo): Promise<LogView | null>;
  changedFiles: readonly ChangedFile[];
  /** Repository files at the head commit and on the default branch. */
  files(): Promise<ReadonlyArray<{ path: string; content: string }>>;
}

/** Lines a multi-line quote may skip between two quoted lines (blank lines, elided output). */
const MAX_LINE_GAP = 5;
/** Repository walk limits; fixtures are far smaller, real repositories are not walked. */
const MAX_FILES = 2000;
const MAX_FILE_CHARS = 200_000;

// What the agent's own displays add to a line, which a faithful quote may carry along:
// "  812 | " / "> 812 | " prefixes (excerpts, read_log, search_log) and clip markers.
const DISPLAY_PREFIX = /^\s*>?\s*\d+ \| ?/;
const CLIP_SUFFIX = /\s*(?:\[\.\.\. \d+ more chars\]|…\[truncated\])\s*$/;
const ELLIPSIS = /\s*(?:\.{3}|…)\s*/;

/**
 * A quote as ordered lines of ordered fragments: display prefixes and clip markers removed, whitespace
 * collapsed, and "..." treated as an elision. Blank lines and bare ellipses are dropped.
 */
export function quoteLines(excerpt: string): string[][] {
  return excerpt
    .split(/\r?\n|\r/)
    .map((line) => stripAnsi(line).replace(DISPLAY_PREFIX, "").replace(CLIP_SUFFIX, ""))
    .map((line) =>
      line
        .split(ELLIPSIS)
        .map(collapse)
        .filter((fragment) => fragment !== ""),
    )
    .filter((fragments) => fragments.length > 0);
}

function collapse(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/** True when every fragment occurs in the line, in order. */
function lineContains(text: string, fragments: readonly string[]): boolean {
  const line = collapse(stripAnsi(text));
  let from = 0;
  for (const fragment of fragments) {
    const at = line.indexOf(fragment, from);
    if (at === -1) return false;
    from = at + fragment.length;
  }
  return true;
}

/**
 * Every 0-based [first, last] span of `texts` where the quote's lines match in order: the first quoted
 * line at `first`, and each next one within MAX_LINE_GAP lines of the previous match.
 */
export function findQuote(texts: readonly string[], quote: readonly string[][]): Array<[number, number]> {
  const [head, ...rest] = quote;
  if (head === undefined) return [];
  const spans: Array<[number, number]> = [];
  for (let start = 0; start < texts.length; start++) {
    if (!lineContains(texts[start] ?? "", head)) continue;
    let last = start;
    let ok = true;
    for (const fragments of rest) {
      let next = -1;
      for (let i = last + 1; i <= Math.min(texts.length - 1, last + MAX_LINE_GAP); i++) {
        if (lineContains(texts[i] ?? "", fragments)) {
          next = i;
          break;
        }
      }
      if (next === -1) {
        ok = false;
        break;
      }
      last = next;
    }
    if (ok) spans.push([start, last]);
  }
  return spans;
}

/**
 * The tools' lookup (exact name, then case-insensitive name, then numeric id), plus the
 * "name (id 123)" form the first message uses as each failed job's heading.
 */
function resolveJob(jobs: readonly JobInfo[], reference: string): JobInfo | null {
  const wanted = reference.trim();
  const lower = wanted.toLowerCase();
  const heading = /^.*\(id (\d+)\)$/.exec(wanted);
  return (
    jobs.find((job) => job.name === wanted) ??
    jobs.find((job) => job.name.toLowerCase() === lower) ??
    (/^\d+$/.test(wanted) ? jobs.find((job) => job.id === Number(wanted)) : undefined) ??
    (heading ? jobs.find((job) => job.id === Number(heading[1])) : undefined) ??
    null
  );
}

/**
 * Repository files a `job` field names instead of a job: the exact path, or a path suffix that only one
 * file has ("ci.yml" for .github/workflows/ci.yml). Every version (head, default branch) is returned.
 */
async function resolveFile(
  sources: EvidenceSources,
  reference: string,
): Promise<Array<{ path: string; content: string }>> {
  const wanted = reference.trim().replace(/^\.?\//, "");
  if (wanted === "") return [];
  const files = await sources.files();
  const exact = files.filter((file) => file.path === wanted);
  if (exact.length > 0) return exact;
  const suffixed = files.filter((file) => file.path.endsWith(`/${wanted}`));
  return new Set(suffixed.map((file) => file.path)).size === 1 ? suffixed : [];
}

async function logTexts(sources: EvidenceSources, job: JobInfo): Promise<string[] | null> {
  const view = await sources.log(job);
  return view === null ? null : view.all().map((line) => line.text);
}

/** First place outside `skip` where the quote occurs, or null. */
async function findAnywhere(
  sources: EvidenceSources,
  quote: readonly string[][],
  skip: JobInfo | null,
): Promise<string | null> {
  for (const job of sources.jobs) {
    if (job === skip) continue;
    const texts = await logTexts(sources, job);
    const span = texts === null ? undefined : findQuote(texts, quote)[0];
    if (span !== undefined) return `log ${job.name}:${span[0] + 1}`;
  }
  for (const file of sources.changedFiles) {
    if (file.patch === null) continue;
    const span = findQuote(file.patch.split("\n"), quote)[0];
    if (span !== undefined) return `diff ${file.path}:${span[0] + 1}`;
  }
  for (const file of await sources.files()) {
    const span = findQuote(file.content.split(/\r?\n/), quote)[0];
    if (span !== undefined) return `file ${file.path}:${span[0] + 1}`;
  }
  return null;
}

export async function checkEvidence(item: TriageEvidence, sources: EvidenceSources): Promise<EvidenceCheck> {
  const base = { job: item.job, line: item.line, excerpt: item.excerpt };
  const quote = quoteLines(item.excerpt);
  if (quote.length === 0) return { ...base, verdict: "not_found", foundAt: null };

  const job = resolveJob(sources.jobs, item.job);
  if (job !== null) {
    const texts = await logTexts(sources, job);
    const spans = texts === null ? [] : findQuote(texts, quote);
    if (item.line === null) {
      const span = spans[0];
      if (span !== undefined)
        return { ...base, verdict: "verified", foundAt: `log ${job.name}:${span[0] + 1}` };
    } else {
      const cited = item.line - 1;
      if (spans.some(([first, last]) => cited >= first && cited <= last)) {
        return { ...base, verdict: "verified", foundAt: `log ${job.name}:${item.line}` };
      }
      const span = spans[0];
      if (span !== undefined)
        return { ...base, verdict: "misplaced", foundAt: `log ${job.name}:${span[0] + 1}` };
    }
  }

  // A citation of a file by path and line ("src/a.ts", line 20) renders as "src/a.ts line 20" in the
  // comment, which a reader can check, so it counts when the quote is at that line of the file.
  if (job === null && item.line !== null) {
    const cited = item.line - 1;
    for (const file of await resolveFile(sources, item.job)) {
      const spans = findQuote(file.content.split(/\r?\n/), quote);
      if (spans.some(([first, last]) => cited >= first && cited <= last)) {
        return { ...base, verdict: "verified", foundAt: `file ${file.path}:${item.line}` };
      }
    }
  }

  const elsewhere = await findAnywhere(sources, quote, job);
  if (elsewhere === null) return { ...base, verdict: "not_found", foundAt: null };
  // A quote cited with a line number belongs at that line of that job's log; without one, any source counts.
  return { ...base, verdict: item.line === null ? "verified" : "misplaced", foundAt: elsewhere };
}

/** Checks every evidence item of a result; null when there is no result to check. */
export async function gradeEvidence(
  result: TriageResult | null,
  sources: EvidenceSources,
): Promise<EvidenceGrade | null> {
  if (result === null) return null;
  const items: EvidenceCheck[] = [];
  for (const item of result.evidence) items.push(await checkEvidence(item, sources));
  return { ...countVerdicts(items), items };
}

export function countVerdicts(items: readonly EvidenceCheck[]): EvidenceCounts {
  return {
    total: items.length,
    verified: items.filter((i) => i.verdict === "verified").length,
    misplaced: items.filter((i) => i.verdict === "misplaced").length,
    notFound: items.filter((i) => i.verdict === "not_found").length,
  };
}

/**
 * Evidence sources read through `backend`, the same (redacting) backend the agent used. Logs and the
 * repository walk are loaded lazily and cached; failures read as "unavailable", never as errors.
 */
export async function loadEvidenceSources(backend: TriageBackend): Promise<EvidenceSources> {
  const run = await backend.getRun();
  const jobs = await backend.listJobs();
  const changedFiles = await backend.getChangedFiles().catch((): ChangedFile[] => []);

  const logs = new Map<number, Promise<LogView | null>>();
  let files: Promise<Array<{ path: string; content: string }>> | null = null;

  return {
    jobs,
    changedFiles,
    log(job) {
      let pending = logs.get(job.id);
      if (pending === undefined) {
        pending = backend.getJobLog(job.id).then(
          (raw) => parseJobLog(raw, job),
          () => null,
        );
        logs.set(job.id, pending);
      }
      return pending;
    },
    files() {
      files ??= walkRepository(backend, [run.headSha, run.defaultBranch]);
      return files;
    },
  };
}

async function walkRepository(
  backend: TriageBackend,
  refs: readonly string[],
): Promise<Array<{ path: string; content: string }>> {
  const out: Array<{ path: string; content: string }> = [];
  const seen = new Set<string>();
  for (const ref of refs) {
    const pending = [""];
    while (pending.length > 0 && out.length < MAX_FILES) {
      const dir = pending.shift() ?? "";
      const entries = (await backend.listDirectory(dir, ref).catch(() => null)) ?? [];
      for (const entry of entries) {
        const path = dir === "" ? entry : `${dir}/${entry}`;
        if (entry.endsWith("/")) {
          pending.push(path.slice(0, -1));
          continue;
        }
        const content = await backend.readFile(path, ref).catch(() => null);
        const key = `${path}\u0000${content ?? ""}`;
        if (content === null || content.length > MAX_FILE_CHARS || seen.has(key)) continue;
        seen.add(key);
        out.push({ path, content });
        if (out.length >= MAX_FILES) break;
      }
    }
  }
  return out;
}
