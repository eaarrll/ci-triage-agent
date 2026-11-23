/**
 * Deterministic log processing: normalize a raw GitHub job log into numbered lines,
 * attribute each line to a step by timestamp, search it, and pick the excerpt the agent
 * sees first. Nothing here calls the network or the model.
 */
import vm from "node:vm";
import type {
  JobInfo,
  LogExcerpt,
  LogMatch,
  LogSearchOptions,
  LogSearchResult,
  LogView,
  NumberedLine,
  StepInfo,
} from "./types.js";

/** Raw logs above this size keep their head and tail and drop the middle. */
export const MAX_LOG_BYTES = 20 * 1024 * 1024;

const MAX_LINE_CHARS = 2000;
const LINE_TRUNCATED_SUFFIX = "…[truncated]";
/** Share of the byte budget kept from the start of an oversized log; the rest comes from the end. */
const HEAD_SHARE = 0.1;
/** Step completedAt has second precision, so a step's last lines can be up to 1s later. */
const STEP_END_GRACE_MS = 1000;

const MAX_SLICE_LINES = 400;
const MAX_PATTERN_CHARS = 300;
const DEFAULT_SEARCH_CONTEXT = 3;
const MAX_SEARCH_CONTEXT = 20;
const DEFAULT_MAX_MATCHES = 20;
const MAX_MATCHES = 50;
/** Wall-clock cap for one regex search; it runs in a vm context so a runaway pattern can be interrupted. */
const REGEX_TIMEOUT_MS = 1000;

const DEFAULT_EXCERPT_LINES = 160;
const TAIL_LINES = 30;
const MIN_TAIL_LINES = 5;
const SIGNAL_RADII = [8, 4, 2, 0] as const;

const FAILED_STEP_CONCLUSIONS: ReadonlySet<string> = new Set(["failure", "timed_out", "cancelled"]);

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

export interface ParseOptions {
  maxBytes?: number;
}

const TIMESTAMP = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,9}))?Z ?/;
// OSC (terminated by BEL or ST), CSI, other escapes with optional intermediates (tput's
// charset reset "ESC ( B", cursor save "ESC 7"), and a stray ESC left by anything else.
const ANSI_ESCAPE =
  /\u001b\][^\u0007\u001b]*(?:\u0007|\u001b\\)|\u001b\[[0-?]*[ -/]*[@-~]|\u001b[ -/]*[0-~]|\u001b/g;
const BOM = "﻿";

/** Remove terminal escape sequences (colors, cursor movement, OSC titles). */
export function stripAnsi(text: string): string {
  return text.replace(ANSI_ESCAPE, "");
}

interface RawLine {
  text: string;
  /** epoch ms of the line's timestamp prefix, or null when it had none */
  time: number | null;
}

interface StepWindow {
  number: number;
  start: number;
  end: number;
}

/** Normalize a raw GitHub job log (strip ANSI + timestamps, attribute lines to steps). */
export function parseJobLog(raw: string, job: JobInfo, opts: ParseOptions = {}): LogView {
  const { head, tail, omittedBytes } = capLogSize(raw, opts.maxBytes ?? MAX_LOG_BYTES);
  const headLines = splitLines(head.startsWith(BOM) ? head.slice(1) : head).map(normalizeLine);
  // concat, not push(...lines): spreading hundreds of thousands of arguments overflows the stack.
  const rawLines =
    tail === null
      ? headLines
      : headLines.concat(
          { text: `… [${omittedBytes} bytes omitted by ci-triage-agent] …`, time: null },
          splitLines(tail).map(normalizeLine),
        );

  const windows = stepWindows(job.steps);
  const lines: NumberedLine[] = [];
  const steps: Array<number | null> = [];
  let current: number | null = null;
  for (const { text, time } of rawLines) {
    // Lines without a timestamp (and the omission marker) inherit the previous line's step.
    if (time !== null) current = stepAt(windows, time);
    lines.push({ n: lines.length + 1, text });
    steps.push(current);
  }
  return new JobLogView(job.id, job.name, tail !== null, lines, steps);
}

interface SizedLog {
  head: string;
  /** null when the log fit the budget and `head` is the whole log */
  tail: string | null;
  omittedBytes: number;
}

/** Keep the first 10% and last 90% of the byte budget, cut at line boundaries. */
function capLogSize(raw: string, maxBytes: number): SizedLog {
  if (Buffer.byteLength(raw, "utf8") <= maxBytes) return { head: raw, tail: null, omittedBytes: 0 };
  const bytes = Buffer.from(raw, "utf8");
  const headBudget = Math.floor(maxBytes * HEAD_SHARE);
  const headEnd = lineStartAtOrBefore(bytes, headBudget);
  const tailStart = lineStartAtOrAfter(bytes, bytes.length - (maxBytes - headBudget));
  return {
    head: bytes.toString("utf8", 0, headEnd),
    tail: bytes.toString("utf8", tailStart),
    omittedBytes: tailStart - headEnd,
  };
}

/** Offset just past the last "\n" before `limit` (0 if none). Newline bytes never occur inside a UTF-8 sequence. */
function lineStartAtOrBefore(bytes: Buffer, limit: number): number {
  if (limit <= 0) return 0;
  const newline = bytes.lastIndexOf(0x0a, limit - 1);
  return newline === -1 ? 0 : newline + 1;
}

function lineStartAtOrAfter(bytes: Buffer, from: number): number {
  if (from <= 0 || bytes[from - 1] === 0x0a) return Math.max(0, from);
  const newline = bytes.indexOf(0x0a, from);
  return newline === -1 ? bytes.length : newline + 1;
}

function splitLines(text: string): string[] {
  const lines = text.split("\n");
  if (lines.at(-1) === "") lines.pop();
  return lines;
}

function normalizeLine(line: string): RawLine {
  let text = trimTrailingCarriageReturns(line);
  let time: number | null = null;
  const stamp = TIMESTAMP.exec(text);
  if (stamp) {
    time = timestampMs(stamp);
    text = text.slice(stamp[0].length);
  }
  text = text.replace(ANSI_ESCAPE, "");
  // Progress bars redraw with "\r"; only the final state is what a terminal would show.
  text = text.slice(text.lastIndexOf("\r") + 1);
  return { text: capLine(text), time };
}

function trimTrailingCarriageReturns(line: string): string {
  let end = line.length;
  while (end > 0 && line.charCodeAt(end - 1) === 13) end--;
  return line.slice(0, end);
}

function timestampMs(match: RegExpExecArray): number {
  const [, year, month, day, hour, minute, second, fraction] = match;
  const whole = Date.UTC(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
    Number(second),
  );
  return fraction ? whole + Number(`0.${fraction}`) * 1000 : whole;
}

function capLine(text: string): string {
  return text.length > MAX_LINE_CHARS ? text.slice(0, MAX_LINE_CHARS) + LINE_TRUNCATED_SUFFIX : text;
}

function parseTime(iso: string | null): number | null {
  if (iso === null) return null;
  const ms = Date.parse(iso);
  return Number.isNaN(ms) ? null : ms;
}

/** Steps that ran, latest-starting first so the first containing window wins ties at second boundaries. */
function stepWindows(steps: readonly StepInfo[]): StepWindow[] {
  const windows: StepWindow[] = [];
  for (const step of steps) {
    // A skipped step prints nothing, but GitHub stamps it with the failing step's end time,
    // so its window would claim that step's last lines (the error and the exit code).
    if (step.conclusion === "skipped") continue;
    const start = parseTime(step.startedAt);
    if (start === null) continue;
    const completed = parseTime(step.completedAt);
    const end = completed === null ? Number.POSITIVE_INFINITY : completed + STEP_END_GRACE_MS;
    windows.push({ number: step.number, start, end });
  }
  return windows.sort((a, b) => b.start - a.start || b.number - a.number);
}

function stepAt(windows: readonly StepWindow[], time: number): number | null {
  return windows.find((w) => time >= w.start && time <= w.end)?.number ?? null;
}

// ---------------------------------------------------------------------------
// LogView
// ---------------------------------------------------------------------------

class JobLogView implements LogView {
  readonly jobId: number;
  readonly jobName: string;
  readonly truncated: boolean;
  readonly lineCount: number;
  private readonly lines: readonly NumberedLine[];
  /** step number per line, by index */
  private readonly steps: ReadonlyArray<number | null>;
  private readonly texts: readonly string[];
  private readonly ranges = new Map<number, { start: number; end: number }>();

  constructor(
    jobId: number,
    jobName: string,
    truncated: boolean,
    lines: readonly NumberedLine[],
    steps: ReadonlyArray<number | null>,
  ) {
    this.jobId = jobId;
    this.jobName = jobName;
    this.truncated = truncated;
    this.lineCount = lines.length;
    this.lines = lines;
    this.steps = steps;
    this.texts = lines.map((line) => line.text);
    steps.forEach((step, index) => {
      if (step === null) return;
      const range = this.ranges.get(step);
      if (range) range.end = index + 1;
      else this.ranges.set(step, { start: index + 1, end: index + 1 });
    });
  }

  search(pattern: string, opts: LogSearchOptions = {}): LogSearchResult {
    const context = clampInt(opts.context, DEFAULT_SEARCH_CONTEXT, 0, MAX_SEARCH_CONTEXT);
    const maxMatches = clampInt(opts.maxMatches, DEFAULT_MAX_MATCHES, 1, MAX_MATCHES);
    const found = findLineIndices(this.texts, pattern, opts);

    let totalMatches = 0;
    const matches: LogMatch[] = [];
    for (const index of found.indices) {
      const n = index + 1;
      if (opts.step !== undefined && this.stepOf(n) !== opts.step) continue;
      totalMatches++;
      if (matches.length < maxMatches)
        matches.push({ line: n, context: this.slice(n - context, n + context) });
    }
    const result: LogSearchResult = { totalMatches, matches, truncated: totalMatches > matches.length };
    if (found.note !== undefined) result.note = found.note;
    return result;
  }

  slice(start: number, end: number): NumberedLine[] {
    if (this.lineCount === 0) return [];
    const from = clampInt(start, 1, 1, this.lineCount);
    const to = Math.min(clampInt(end, this.lineCount, 1, this.lineCount), from + MAX_SLICE_LINES - 1);
    return from > to ? [] : this.lines.slice(from - 1, to);
  }

  all(): readonly NumberedLine[] {
    return this.lines;
  }

  stepOf(line: number): number | null {
    return this.steps[line - 1] ?? null;
  }

  stepRange(stepNumber: number): { start: number; end: number } | null {
    const range = this.ranges.get(stepNumber);
    return range ? { ...range } : null;
  }
}

function clampInt(value: number | undefined, fallback: number, min: number, max: number): number {
  if (value === undefined || !Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(value)));
}

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------

interface FoundLines {
  /** 0-based indices of matching lines, ascending */
  indices: number[];
  note?: string;
}

type RegexScan = { ok: true; indices: number[] } | { ok: false; reason: string };

// Runs inside a fresh vm context: `texts`, `source` and `flags` are its only globals.
const REGEX_SCAN = new vm.Script(`(() => {
  const re = new RegExp(source, flags);
  const hits = [];
  for (let i = 0; i < texts.length; i++) if (re.test(texts[i])) hits.push(i);
  return hits;
})()`);

function findLineIndices(texts: readonly string[], pattern: string, opts: LogSearchOptions): FoundLines {
  const notes: string[] = [];
  let needle = pattern;
  if (needle.length > MAX_PATTERN_CHARS) {
    needle = needle.slice(0, MAX_PATTERN_CHARS);
    notes.push(`pattern truncated to ${MAX_PATTERN_CHARS} characters`);
  }
  if (needle === "") return withNotes([], [...notes, "empty pattern: nothing searched"]);

  if (opts.regex) {
    const scan = regexScan(texts, needle, opts.caseSensitive ? "" : "i");
    if (scan.ok) return withNotes(scan.indices, notes);
    notes.push(`${scan.reason}; searched for the literal text instead`);
  }
  return withNotes(literalScan(texts, needle, opts.caseSensitive ?? false), notes);
}

function withNotes(indices: number[], notes: readonly string[]): FoundLines {
  return notes.length > 0 ? { indices, note: notes.join("; ") } : { indices };
}

/**
 * The pattern comes from the model, which reads untrusted logs, so it may be crafted for
 * catastrophic backtracking. A synchronous regex would block the event loop (and every
 * timeout with it); a vm context with a timeout can interrupt it.
 */
function regexScan(texts: readonly string[], source: string, flags: string): RegexScan {
  try {
    // Compile here first so a syntax error is reported as such rather than as a vm failure.
    new RegExp(source, flags);
  } catch (error) {
    return { ok: false, reason: `invalid regular expression (${errorMessage(error)})` };
  }
  try {
    const hits: unknown = REGEX_SCAN.runInContext(vm.createContext({ texts, source, flags }), {
      timeout: REGEX_TIMEOUT_MS,
    });
    return { ok: true, indices: Array.from(hits as ArrayLike<number>) };
  } catch {
    return { ok: false, reason: `regular expression took longer than ${REGEX_TIMEOUT_MS} ms` };
  }
}

function literalScan(texts: readonly string[], needle: string, caseSensitive: boolean): number[] {
  const target = caseSensitive ? needle : needle.toLowerCase();
  const indices: number[] = [];
  texts.forEach((text, index) => {
    if ((caseSensitive ? text : text.toLowerCase()).includes(target)) indices.push(index);
  });
  return indices;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

// ---------------------------------------------------------------------------
// Failure signals
// ---------------------------------------------------------------------------

/** Steps that did not succeed: their output is where the failure is. */
export function isFailedStep(step: StepInfo): boolean {
  return step.conclusion !== null && FAILED_STEP_CONCLUSIONS.has(step.conclusion);
}

export function failedStepsOf(job: JobInfo): StepInfo[] {
  return job.steps.filter(isFailedStep);
}

const ERROR_MARKER = "##[error]";
/** Markers GitHub adds to every failed step; they only say that the step failed. */
const GENERIC_ERROR_MARKER =
  /^##\[error\](?:Process completed with exit code \d+|The operation was canceled)\.?\s*$/;
const STRONG_SIGNALS: readonly RegExp[] = [
  /Traceback \(most recent call last\)/,
  /\bpanic:/,
  /^npm (?:ERR!|error)\s/,
  /\bAssertionError\b/,
  /^\s*--- FAIL\b/,
  /^FAILED\s/,
  /^\s*● /,
  /│\s*Error:/,
  /\bfatal:/i,
  /^\s*Killed\s*$|\d\s+Killed\s/,
  /Exception\b/,
];
const WEAK_SIGNALS: readonly RegExp[] = [
  /(?<!\b(?:0|[Nn]o|zero)\s)\b(?:error|ERROR|Error)\b[:\s]/,
  /\bFAIL(?:ED)?\b/,
  /\bexit code [1-9]/,
  // "Received 84934656 of 84934656 (100.0%)" is @actions/cache download progress, not a diff.
  /^\s*(?:Expected|Received)\b(?! \d+ of \d+)/,
  /^E {2,}\S/,
];
/** Reporter lines for tests that passed: their names often contain "error" or "timeout". */
const PASSING_TEST_LINE = /^\s*(?:✓|✔|√|PASS\s|ok\s|--- PASS\b)|\sPASSED\b/;
const BOILERPLATE_STEP = /^(?:Set up job|Complete job|Post\b)/;

const SCORE = {
  errorMarker: 100,
  strong: 70,
  weak: 50,
  genericErrorMarker: 40,
  inFailedStep: 30,
  inSucceededStep: -25,
  inBoilerplateStep: -40,
  failedStepTail: 1000,
} as const;

/** Lines that never count as failure evidence: debug output and passing-test reports. */
export function isIgnorableLine(text: string): boolean {
  return text.startsWith("##[debug]") || PASSING_TEST_LINE.test(text);
}

const RUN_GROUP = /^##\[group\]Run /;
const END_GROUP = "##[endgroup]";
/** The runner prints a header in one piece, so it never contains another group or an annotation. */
const NOT_IN_RUN_HEADER = /^##\[(?:group|error|warning|notice)\]/;
const MAX_RUN_HEADER_LINES = 300;

/**
 * Line numbers of the "##[group]Run …" headers GitHub prints before each step: they echo the
 * step's script, inputs and env, so an `echo "error: …"` in a script is not an error. A step's
 * own `::group::Run …` that never closes (the script died inside it) is dropped at the next
 * group or annotation, so it cannot hide the error and the lines after it.
 */
export function echoedScriptLines(lines: readonly NumberedLine[]): ReadonlySet<number> {
  const echoed = new Set<number>();
  let openedAt: number | null = null;
  for (const { n, text } of lines) {
    if (openedAt !== null && (n - openedAt > MAX_RUN_HEADER_LINES || NOT_IN_RUN_HEADER.test(text)))
      openedAt = null;
    if (openedAt === null) {
      if (RUN_GROUP.test(text)) openedAt = n;
    } else if (text.startsWith(END_GROUP)) {
      for (let k = openedAt; k <= n; k++) echoed.add(k);
      openedAt = null;
    }
  }
  return echoed;
}

export interface RankedSignal {
  n: number;
  text: string;
  score: number;
}

/**
 * Error-ish lines, strongest first (ties: earliest first). Identical lines count once, at
 * their first occurrence, so a repeated retry message cannot crowd out the original error.
 */
export function rankSignals(view: LogView, job: JobInfo): RankedSignal[] {
  const stepsByNumber = new Map(job.steps.map((step) => [step.number, step]));
  const echoed = echoedScriptLines(view.all());
  const seen = new Set<string>();
  const signals: RankedSignal[] = [];
  for (const { n, text } of view.all()) {
    if (echoed.has(n) || seen.has(text)) continue;
    const strength = signalStrength(text);
    if (strength === 0) continue;
    seen.add(text);
    const stepNumber = view.stepOf(n);
    const step = stepNumber === null ? undefined : stepsByNumber.get(stepNumber);
    signals.push({ n, text, score: strength + stepAdjustment(step) });
  }
  return signals.sort((a, b) => b.score - a.score || a.n - b.n);
}

function signalStrength(text: string): number {
  if (isIgnorableLine(text)) return 0;
  if (text.startsWith(ERROR_MARKER)) {
    return GENERIC_ERROR_MARKER.test(text) ? SCORE.genericErrorMarker : SCORE.errorMarker;
  }
  if (STRONG_SIGNALS.some((re) => re.test(text))) return SCORE.strong;
  if (WEAK_SIGNALS.some((re) => re.test(text))) return SCORE.weak;
  return 0;
}

function stepAdjustment(step: StepInfo | undefined): number {
  if (!step) return 0;
  if (BOILERPLATE_STEP.test(step.name)) return SCORE.inBoilerplateStep;
  if (isFailedStep(step)) return SCORE.inFailedStep;
  if (step.conclusion === "success") return SCORE.inSucceededStep;
  return 0;
}

// ---------------------------------------------------------------------------
// Excerpt
// ---------------------------------------------------------------------------

export interface ExcerptOptions {
  /** Total line budget across all ranges. Default 160. */
  maxLines?: number;
}

type Span = readonly [start: number, end: number];

interface ExcerptWindow {
  score: number;
  /** the line that triggered the window; null for a failed step's tail */
  signal: number | null;
  /** candidate spans, widest first; the first that fits the remaining budget is used */
  spans: readonly Span[];
}

/**
 * Pick the windows of the log most likely to explain the failure. `totalLines` is the
 * length of the whole log, so a reader can tell how much the excerpt leaves out.
 */
export function extractExcerpt(view: LogView, job: JobInfo, opts: ExcerptOptions = {}): LogExcerpt {
  const maxLines = clampInt(opts.maxLines, DEFAULT_EXCERPT_LINES, 1, Number.MAX_SAFE_INTEGER);
  const failedSteps = failedStepsOf(job);
  const signals = rankSignals(view, job);
  const base = { failedSteps: failedSteps.map((step) => step.name), totalLines: view.lineCount };

  if (view.lineCount <= maxLines) {
    const ranges = view.lineCount === 0 ? [] : [rangeOf(view, 1, view.lineCount)];
    return { ...base, ranges, signalLines: signals.map((s) => s.n).sort(ascending) };
  }

  const windows = [
    ...tailWindows(view, failedSteps, maxLines),
    ...signals.map((s) => signalWindow(s, view.lineCount)),
  ];
  const { covered, signalLines } = fitWindows(windows, view.lineCount, maxLines);
  return { ...base, ranges: coveredRanges(view, covered), signalLines: signalLines.sort(ascending) };
}

/** The last lines of each failed step (or of the log, without step attribution). */
function tailWindows(view: LogView, failedSteps: readonly StepInfo[], maxLines: number): ExcerptWindow[] {
  const stepRanges = failedSteps.map((step) => view.stepRange(step.number)).filter((r) => r !== null);
  const targets = stepRanges.length > 0 ? stepRanges : [{ start: 1, end: view.lineCount }];
  // Leave at least half of the budget for windows around the error signals.
  const size = Math.min(TAIL_LINES, Math.max(MIN_TAIL_LINES, Math.floor(maxLines / 2 / targets.length)));
  return targets.map(({ start, end }) => ({
    score: SCORE.failedStepTail,
    signal: null,
    // The last span is for budgets too small for even MIN_TAIL_LINES.
    spans: [
      ...new Set([size, Math.min(size, 15), Math.min(size, MIN_TAIL_LINES), Math.min(size, maxLines)]),
    ].map((k): Span => [Math.max(start, end - k + 1), end]),
  }));
}

function signalWindow(signal: RankedSignal, lineCount: number): ExcerptWindow {
  return {
    score: signal.score,
    signal: signal.n,
    spans: SIGNAL_RADII.map((r): Span => [Math.max(1, signal.n - r), Math.min(lineCount, signal.n + r)]),
  };
}

/** Greedy by score: each window takes its widest span that still fits; the rest are dropped. */
function fitWindows(
  windows: readonly ExcerptWindow[],
  lineCount: number,
  budget: number,
): { covered: Uint8Array; signalLines: number[] } {
  const covered = new Uint8Array(lineCount + 1);
  const signalLines: number[] = [];
  let used = 0;
  const ordered = [...windows].sort((a, b) => b.score - a.score || firstLine(a) - firstLine(b));
  for (const window of ordered) {
    const span = window.spans.find(([start, end]) => used + uncoveredCount(covered, start, end) <= budget);
    if (!span) continue;
    for (let n = span[0]; n <= span[1]; n++) {
      if (covered[n] === 0) used++;
      covered[n] = 1;
    }
    if (window.signal !== null) signalLines.push(window.signal);
  }
  return { covered, signalLines };
}

function firstLine(window: ExcerptWindow): number {
  return window.spans[0]?.[0] ?? 0;
}

function uncoveredCount(covered: Uint8Array, start: number, end: number): number {
  let count = 0;
  for (let n = start; n <= end; n++) if (covered[n] === 0) count++;
  return count;
}

/** Contiguous covered lines become one range, so overlapping and adjacent windows merge. */
function coveredRanges(view: LogView, covered: Uint8Array): LogExcerpt["ranges"] {
  const ranges: LogExcerpt["ranges"] = [];
  let start: number | null = null;
  for (let n = 1; n <= view.lineCount + 1; n++) {
    const isCovered = n <= view.lineCount && covered[n] === 1;
    if (isCovered && start === null) start = n;
    if (!isCovered && start !== null) {
      ranges.push(rangeOf(view, start, n - 1));
      start = null;
    }
  }
  return ranges;
}

function rangeOf(view: LogView, start: number, end: number): LogExcerpt["ranges"][number] {
  return { start, end, lines: view.all().slice(start - 1, end) };
}

function ascending(a: number, b: number): number {
  return a - b;
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

/** Render numbered lines as `  123 | text` (right-aligned numbers). */
export function formatLines(lines: readonly NumberedLine[]): string {
  const width = String(lines.reduce((max, line) => Math.max(max, line.n), 0)).length;
  return lines.map((line) => `  ${String(line.n).padStart(width)} | ${line.text}`).join("\n");
}
