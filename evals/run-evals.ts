/**
 * Offline eval harness: runs the triage agent (or the heuristic baseline) against every recorded
 * fixture under evals/fixtures and grades each answer. See evals/README.md.
 *
 *   npm run eval -- --heuristic
 *   npm run eval -- --model claude-opus-5-5 --effort medium --repeat 3
 */
import { constants, realpathSync } from "node:fs";
import { access, mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { runTriage } from "../src/agent/agent.js";
import { buildContext } from "../src/context.js";
import { withRedaction } from "../src/redact.js";
import { heuristicTriage } from "../src/signatures.js";
import { CATEGORIES } from "../src/types.js";
import type {
  AgentLogger,
  Category,
  Confidence,
  Effort,
  StopCause,
  TriageOutcome,
  UsageTotals,
} from "../src/types.js";
import { countVerdicts, gradeEvidence, loadEvidenceSources } from "./evidence.js";
import type { EvidenceCheck, EvidenceCounts, EvidenceGrade } from "./evidence.js";
import { createFixtureBackend, loadFixtures } from "./fixture.js";
import type { FixtureFile, LoadedFixture } from "./fixture.js";
import { grade } from "./grade.js";

const EVALS_DIR = fileURLToPath(new URL(".", import.meta.url));
export const FIXTURES_DIR = join(EVALS_DIR, "fixtures");
export const DEFAULT_OUT_DIR = join(EVALS_DIR, "results");
const CASE_TIMEOUT_MS = 300_000;

// ---------------------------------------------------------------------------
// Command line
// ---------------------------------------------------------------------------

export interface EvalOptions {
  model: string;
  effort: Effort;
  /** Fixture ids to run; null = all. */
  only: string[] | null;
  repeat: number;
  concurrency: number;
  /** Use the signature-only heuristic instead of the agent (no API key, no cost). */
  heuristic: boolean;
  maxCostUsd: number;
  maxTurns: number;
  /** Absolute output directory. */
  outDir: string;
  /** File-name-safe report name. */
  label: string;
}

export type CliCommand = { kind: "help" } | { kind: "run"; options: EvalOptions };

/** Bad command-line input: printed with the usage text, exit code 1. */
export class UsageError extends Error {
  override name = "UsageError";
}

export const USAGE = `Usage: npm run eval -- [options]

  --model <id>          Model for the agent (default claude-opus-5-5)
  --effort <level>      low | medium | high | xhigh | max (default medium)
  --only <ids>          Comma-separated fixture ids (default: all)
  --repeat <n>          Runs per fixture, to measure variance (default 1)
  --concurrency <n>     Cases in flight at once (default 3)
  --heuristic           Signature-only baseline: no LLM, no API key needed
  --max-cost-usd <usd>  Agent budget per case (default 0.50)
  --max-turns <n>       Agent turn limit per case (default 12)
  --out <dir>           Output directory (default evals/results)
  --label <name>        Report name (default <model>-<effort>, or "heuristic")
  -h, --help            Show this help

Requires ANTHROPIC_API_KEY unless --heuristic is set.`;

const EFFORTS: readonly Effort[] = ["low", "medium", "high", "xhigh", "max"];

export function parseCliArgs(argv: readonly string[], cwd: string = process.cwd()): CliCommand {
  let values;
  try {
    ({ values } = parseArgs({
      args: [...argv],
      strict: true,
      allowPositionals: false,
      options: {
        model: { type: "string", default: "claude-opus-5-5" },
        effort: { type: "string", default: "medium" },
        only: { type: "string", multiple: true },
        repeat: { type: "string", default: "1" },
        concurrency: { type: "string", default: "3" },
        heuristic: { type: "boolean", default: false },
        "max-cost-usd": { type: "string", default: "0.50" },
        "max-turns": { type: "string", default: "12" },
        out: { type: "string" },
        label: { type: "string" },
        help: { type: "boolean", short: "h", default: false },
      },
    }));
  } catch (err) {
    throw new UsageError(errorMessage(err));
  }

  if (values.help) return { kind: "help" };

  const model = values.model.trim();
  if (model === "") throw new UsageError("--model must not be empty");
  const effort = parseEffort(values.effort);
  const only = values.only === undefined ? null : parseIdList(values.only);
  const label = sanitizeLabel(values.label ?? (values.heuristic ? "heuristic" : `${model}-${effort}`));

  return {
    kind: "run",
    options: {
      model,
      effort,
      only,
      repeat: parsePositiveInt("--repeat", values.repeat),
      concurrency: parsePositiveInt("--concurrency", values.concurrency),
      heuristic: values.heuristic,
      maxCostUsd: parsePositiveNumber("--max-cost-usd", values["max-cost-usd"]),
      maxTurns: parsePositiveInt("--max-turns", values["max-turns"]),
      outDir: values.out === undefined ? DEFAULT_OUT_DIR : resolve(cwd, values.out),
      label,
    },
  };
}

function parseEffort(value: string): Effort {
  const effort = EFFORTS.find((e) => e === value);
  if (effort === undefined)
    throw new UsageError(`--effort must be one of ${EFFORTS.join(", ")}; got "${value}"`);
  return effort;
}

function parseIdList(values: string[]): string[] {
  const ids = [...new Set(values.flatMap((v) => v.split(",")).map((id) => id.trim()))].filter(
    (id) => id !== "",
  );
  if (ids.length === 0) throw new UsageError("--only needs at least one fixture id");
  return ids;
}

function parsePositiveInt(flag: string, value: string): number {
  const n = /^\d+$/.test(value.trim()) ? Number(value) : NaN;
  if (!Number.isSafeInteger(n) || n < 1)
    throw new UsageError(`${flag} must be a positive integer; got "${value}"`);
  return n;
}

function parsePositiveNumber(flag: string, value: string): number {
  const n = value.trim() === "" ? NaN : Number(value);
  if (!Number.isFinite(n) || n <= 0)
    throw new UsageError(`${flag} must be a positive number; got "${value}"`);
  return n;
}

/** Labels become file names, so anything outside [A-Za-z0-9._-] is replaced. */
function sanitizeLabel(label: string): string {
  const safe = label
    .trim()
    .replace(/[^\w.-]+/g, "-")
    .replace(/^[.-]+/, "");
  if (safe === "") throw new UsageError(`--label "${label}" has no usable characters`);
  return safe;
}

// ---------------------------------------------------------------------------
// Case records
// ---------------------------------------------------------------------------

export interface CaseRecord {
  id: string;
  /** 1-based */
  repeat: number;
  pass: boolean;
  expectedCategories: Category[];
  gotCategory: Category | null;
  confidence: Confidence | null;
  missingKeywords: string[][];
  forbiddenHits: string[];
  flakyOk: boolean | null;
  fixPathOk: boolean | null;
  /** null when the model has no known price or the case crashed before reporting usage */
  costUsd: number | null;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  turns: number;
  toolCalls: number;
  /** Tool names in call order. */
  tools: string[];
  latencyMs: number;
  stopCause: StopCause | null;
  modelUsed: string | null;
  status: TriageOutcome["status"];
  error: string | null;
  title: string | null;
  rootCause: string | null;
  /** Do the cited quotes exist where the agent could see them? Never affects `pass`; null without a result. */
  evidence: EvidenceCounts | null;
  /** One verdict per evidence item, for digging into the JSON report. */
  evidenceItems: EvidenceCheck[];
}

/** Grades one outcome and flattens it into a report row. `evidence` comes from gradeEvidence (async). */
export function toCaseRecord(
  fixture: FixtureFile,
  repeat: number,
  outcome: TriageOutcome,
  latencyMs: number,
  evidence: EvidenceGrade | null = null,
): CaseRecord {
  const result = outcome.status === "ok" ? outcome.result : null;
  const graded = grade(result, fixture.expected);
  return {
    id: fixture.id,
    repeat,
    pass: graded.pass,
    expectedCategories: [...fixture.expected.categories],
    gotCategory: result?.category ?? null,
    confidence: result?.confidence ?? null,
    missingKeywords: graded.missingKeywords,
    forbiddenHits: graded.forbiddenHits,
    flakyOk: graded.flakyOk,
    fixPathOk: graded.fixPathOk,
    costUsd: outcome.usage.costUsd,
    inputTokens: outcome.usage.inputTokens,
    outputTokens: outcome.usage.outputTokens,
    cacheReadTokens: outcome.usage.cacheReadTokens,
    turns: outcome.turns,
    toolCalls: outcome.trace.length,
    tools: outcome.trace.map((call) => call.name),
    latencyMs: Math.round(latencyMs),
    stopCause: outcome.status === "ok" ? outcome.stopCause : null,
    modelUsed: outcome.status === "ok" ? outcome.modelUsed : null,
    status: outcome.status,
    error: outcome.status === "ok" ? null : outcome.message,
    title: result?.title ?? null,
    rootCause: result?.root_cause ?? null,
    evidence: evidence === null ? null : countVerdicts(evidence.items),
    evidenceItems: evidence?.items ?? [],
  };
}

/** Why a case failed, in reading order; empty for a passing case. */
export function failureReasons(record: CaseRecord): string[] {
  if (record.status !== "ok") return [`${record.status}: ${record.error ?? "no message"}`];
  const reasons: string[] = [];
  if (record.gotCategory === null || !record.expectedCategories.includes(record.gotCategory)) {
    reasons.push(
      `category ${record.gotCategory ?? "none"}, expected ${record.expectedCategories.join(" or ")}`,
    );
  }
  if (record.missingKeywords.length > 0) {
    reasons.push(`missing keywords: ${record.missingKeywords.map((group) => group.join("/")).join(", ")}`);
  }
  if (record.forbiddenHits.length > 0) reasons.push(`forbidden text: ${record.forbiddenHits.join(", ")}`);
  if (record.flakyOk === false) reasons.push("wrong flaky_suspected");
  if (record.fixPathOk === false) reasons.push("fix location not identified");
  return reasons;
}

// ---------------------------------------------------------------------------
// Summary statistics
// ---------------------------------------------------------------------------

export interface CategorySummary {
  category: Category;
  cases: number;
  passed: number;
}

export interface EvalSummary {
  cases: number;
  passed: number;
  /** 0..1; 0 when there are no cases */
  passRate: number;
  /** Cases whose outcome status was not "ok". */
  errors: number;
  /** Grouped by each fixture's first expected category, in CATEGORIES order. */
  byCategory: CategorySummary[];
  cost: {
    /** Over priced cases only; null when none are priced. */
    meanPerCase: number | null;
    medianPerCase: number | null;
    total: number;
    unpricedCases: number;
  };
  meanTurns: number;
  latencyMs: { p50: number; p95: number };
  evidence: EvidenceSummary;
}

export interface EvidenceSummary extends EvidenceCounts {
  /** Cases whose evidence was checked (they produced a result). */
  cases: number;
  /** Checked cases that cited at least one item and every item was verified. */
  casesAllVerified: number;
}

export function summarize(records: readonly CaseRecord[]): EvalSummary {
  const passed = records.filter((r) => r.pass).length;
  const costs = records.flatMap((r) => (r.costUsd === null ? [] : [r.costUsd]));
  const latencies = records.map((r) => r.latencyMs);

  const byCategory = CATEGORIES.flatMap((category): CategorySummary[] => {
    const group = records.filter((r) => r.expectedCategories[0] === category);
    return group.length === 0
      ? []
      : [{ category, cases: group.length, passed: group.filter((r) => r.pass).length }];
  });

  return {
    cases: records.length,
    passed,
    passRate: records.length === 0 ? 0 : passed / records.length,
    errors: records.filter((r) => r.status !== "ok").length,
    byCategory,
    cost: {
      meanPerCase: costs.length === 0 ? null : sum(costs) / costs.length,
      medianPerCase: costs.length === 0 ? null : median(costs),
      total: sum(costs),
      unpricedCases: records.length - costs.length,
    },
    meanTurns: records.length === 0 ? 0 : sum(records.map((r) => r.turns)) / records.length,
    latencyMs: { p50: percentile(latencies, 50), p95: percentile(latencies, 95) },
    evidence: summarizeEvidence(records),
  };
}

function summarizeEvidence(records: readonly CaseRecord[]): EvidenceSummary {
  const checked = records.flatMap((r) => (r.evidence === null ? [] : [r.evidence]));
  return {
    cases: checked.length,
    casesAllVerified: checked.filter((e) => e.total > 0 && e.verified === e.total).length,
    total: sum(checked.map((e) => e.total)),
    verified: sum(checked.map((e) => e.verified)),
    misplaced: sum(checked.map((e) => e.misplaced)),
    notFound: sum(checked.map((e) => e.notFound)),
  };
}

/** "3/3", "2/3 (1 misplaced)", "1/3 (1 misplaced, 1 not found)"; "–" when nothing was checked. */
export function formatEvidence(evidence: EvidenceCounts | null): string {
  if (evidence === null) return "–";
  const problems = [
    evidence.misplaced > 0 ? `${evidence.misplaced} misplaced` : "",
    evidence.notFound > 0 ? `${evidence.notFound} not found` : "",
  ].filter((p) => p !== "");
  return `${evidence.verified}/${evidence.total}${problems.length > 0 ? ` (${problems.join(", ")})` : ""}`;
}

/** Nearest-rank percentile (always an observed value); 0 for an empty list. */
export function percentile(values: readonly number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.min(sorted.length, Math.max(1, Math.ceil((p / 100) * sorted.length)));
  return sorted[rank - 1] ?? 0;
}

export function median(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const upper = sorted[mid] ?? 0;
  return sorted.length % 2 === 1 ? upper : ((sorted[mid - 1] ?? 0) + upper) / 2;
}

function sum(values: readonly number[]): number {
  return values.reduce((total, v) => total + v, 0);
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

export interface ReportHeader {
  label: string;
  mode: "agent" | "heuristic";
  /** null in heuristic mode */
  model: string | null;
  effort: Effort | null;
  /** YYYY-MM-DD */
  date: string;
  fixtures: number;
  repeat: number;
  maxCostUsd: number | null;
  maxTurns: number | null;
}

export function reportHeader(options: EvalOptions, fixtures: number, date: string): ReportHeader {
  return {
    label: options.label,
    mode: options.heuristic ? "heuristic" : "agent",
    model: options.heuristic ? null : options.model,
    effort: options.heuristic ? null : options.effort,
    date,
    fixtures,
    repeat: options.repeat,
    maxCostUsd: options.heuristic ? null : options.maxCostUsd,
    maxTurns: options.heuristic ? null : options.maxTurns,
  };
}

export function renderMarkdownReport(
  header: ReportHeader,
  summary: EvalSummary,
  records: readonly CaseRecord[],
): string {
  const setup =
    header.mode === "heuristic"
      ? "mode **heuristic** (signature matching, no LLM)"
      : `model \`${header.model}\` · effort \`${header.effort}\` · budget ${formatUsd(header.maxCostUsd, 2)} and ` +
        `${header.maxTurns} turns per case`;
  const unpriced = summary.cost.unpricedCases > 0 ? ` (${summary.cost.unpricedCases} unpriced)` : "";
  const showRepeat = header.repeat > 1;

  const lines = [
    `# Eval results: ${header.label}`,
    "",
    `Run on ${header.date} · ${setup} · ${plural(header.fixtures, "fixture")} × ${plural(header.repeat, "repeat")}`,
    "",
    "| Metric | Value |",
    "| --- | --- |",
    `| Pass rate | ${summary.passed}/${summary.cases} (${formatPercent(summary.passRate)}) |`,
    `| Errors | ${summary.errors} |`,
    `| Cost per case | mean ${formatUsd(summary.cost.meanPerCase)}, median ${formatUsd(summary.cost.medianPerCase)} |`,
    `| Total cost | ${formatUsd(summary.cost.total)}${unpriced} |`,
    `| Mean turns | ${summary.meanTurns.toFixed(1)} |`,
    `| Latency | p50 ${formatDuration(summary.latencyMs.p50)}, p95 ${formatDuration(summary.latencyMs.p95)} |`,
    ...(summary.evidence.cases > 0 ? [`| Evidence | ${evidenceMetric(summary.evidence)} |`] : []),
    "",
    "## By expected category",
    "",
    "| Category | Passed | Rate |",
    "| --- | --- | --- |",
    ...summary.byCategory.map(
      (c) =>
        `| ${c.category} | ${c.passed}/${c.cases} | ${formatPercent(c.cases === 0 ? 0 : c.passed / c.cases)} |`,
    ),
    "",
    "## Cases",
    "",
    "| | Fixture | Expected | Got | Cost | Turns | Tools | Evidence | Failure reasons |",
    "| --- | --- | --- | --- | --- | --- | --- | --- | --- |",
    ...records.map((r) => {
      const cells = [
        r.pass ? "✅" : "❌",
        showRepeat ? `${r.id} #${r.repeat}` : r.id,
        r.expectedCategories.join(" / "),
        r.gotCategory === null ? r.status : `${r.gotCategory} (${r.confidence ?? "?"})`,
        formatUsd(r.costUsd),
        String(r.turns),
        summarizeTools(r.tools) || "none",
        formatEvidence(r.evidence),
        failureReasons(r).join("; "),
      ];
      return `| ${cells.map(markdownCell).join(" | ")} |`;
    }),
    "",
  ];
  return lines.join("\n");
}

/** "61/64 quotes verified (95%) · 2 misplaced · 1 not found · all verified in 21/24 cases" */
function evidenceMetric(e: EvidenceSummary): string {
  const rate = e.total === 0 ? "" : ` (${formatPercent(e.verified / e.total)})`;
  return [
    `${e.verified}/${e.total} quotes verified${rate}`,
    `${e.misplaced} misplaced`,
    `${e.notFound} not found`,
    `all verified in ${e.casesAllVerified}/${e.cases} cases`,
  ].join(" · ");
}

/** "search_log ×3, read_file" in first-use order. */
export function summarizeTools(tools: readonly string[]): string {
  const counts = new Map<string, number>();
  for (const tool of tools) counts.set(tool, (counts.get(tool) ?? 0) + 1);
  return [...counts].map(([name, n]) => (n > 1 ? `${name} ×${n}` : name)).join(", ");
}

export function renderConsoleTable(records: readonly CaseRecord[]): string {
  const rows = [
    ["", "fixture", "expected", "got", "cost", "turns", "latency", "failure reasons"],
    ...records.map((r) => [
      r.pass ? "PASS" : "FAIL",
      `${r.id} #${r.repeat}`,
      r.expectedCategories.join("/"),
      r.gotCategory ?? r.status,
      formatUsd(r.costUsd),
      String(r.turns),
      formatDuration(r.latencyMs),
      failureReasons(r).join("; "),
    ]),
  ];
  const widths = rows[0]?.map((_, col) => Math.max(...rows.map((row) => (row[col] ?? "").length))) ?? [];
  return rows
    .map((row) =>
      row
        .map((cell, col) => (col === row.length - 1 ? cell : cell.padEnd(widths[col] ?? 0)))
        .join("  ")
        .trimEnd(),
    )
    .join("\n");
}

export function formatProgressLine(done: number, total: number, record: CaseRecord): string {
  const width = String(total).length;
  const parts = [
    `[${String(done).padStart(width)}/${total}]`,
    record.pass ? "PASS" : "FAIL",
    `${record.id} #${record.repeat}`,
    record.gotCategory === null ? record.status : `${record.gotCategory}/${record.confidence ?? "?"}`,
    formatUsd(record.costUsd),
    `${record.turns} turns`,
    `${record.toolCalls} tools`,
    formatDuration(record.latencyMs),
    ...(record.evidence === null ? [] : [`evidence ${formatEvidence(record.evidence)}`]),
  ];
  const reasons = failureReasons(record);
  return parts.join("  ") + (reasons.length > 0 ? `  -- ${reasons.join("; ")}` : "");
}

function formatUsd(value: number | null, digits = 4): string {
  return value === null ? "n/a" : `$${value.toFixed(digits)}`;
}

function formatPercent(ratio: number): string {
  return `${Math.round(ratio * 100)}%`;
}

function formatDuration(ms: number): string {
  return ms < 1000 ? `${Math.round(ms)} ms` : `${(ms / 1000).toFixed(1)} s`;
}

function plural(n: number, noun: string): string {
  return `${n} ${noun}${n === 1 ? "" : "s"}`;
}

function markdownCell(text: string): string {
  // A lone "\r" also ends a Markdown line, and would split the table row.
  return text.replace(/\r\n?|\n/g, " ").replace(/\|/g, "\\|");
}

// ---------------------------------------------------------------------------
// Running
// ---------------------------------------------------------------------------

/** Like Promise.all over `items.map(fn)`, with at most `limit` calls in flight; results keep input order. */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array<R>(items.length);
  let next = 0;
  const worker = async (): Promise<void> => {
    while (next < items.length) {
      const index = next++;
      results[index] = await fn(items[index] as T, index);
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, worker));
  return results;
}

interface CaseSpec {
  fixture: LoadedFixture;
  repeat: number;
}

async function runCase(
  spec: CaseSpec,
  options: EvalOptions,
  apiKey: string | undefined,
): Promise<CaseRecord> {
  const { fixture, repeat } = spec;
  const logger = caseLogger(`${fixture.file.id} #${repeat}`);
  const started = performance.now();
  try {
    const backend = withRedaction(createFixtureBackend(fixture));
    const ctx = await buildContext(backend, { logger });
    const outcome: TriageOutcome = options.heuristic
      ? heuristicOutcome(heuristicTriage(ctx))
      : await runTriage(ctx, backend, {
          model: options.model,
          effort: options.effort,
          maxTurns: options.maxTurns,
          maxCostUsd: options.maxCostUsd,
          timeoutMs: CASE_TIMEOUT_MS,
          extraInstructions: null,
          apiKey,
          logger,
        });
    const latencyMs = performance.now() - started;
    const evidence = await checkCaseEvidence(outcome, backend, logger);
    return toCaseRecord(fixture.file, repeat, outcome, latencyMs, evidence);
  } catch (err) {
    // A crash in the code under test is a failed case, not a harness error.
    const crashed: TriageOutcome = {
      status: "error",
      usage: zeroUsage(null),
      trace: [],
      turns: 0,
      message: errorMessage(err),
    };
    return toCaseRecord(fixture.file, repeat, crashed, performance.now() - started);
  }
}

/** Evidence grading is a side metric: if it breaks, the case keeps its grade and the problem is logged. */
async function checkCaseEvidence(
  outcome: TriageOutcome,
  backend: Parameters<typeof loadEvidenceSources>[0],
  logger: AgentLogger,
): Promise<EvidenceGrade | null> {
  if (outcome.status !== "ok") return null;
  try {
    return await gradeEvidence(outcome.result, await loadEvidenceSources(backend));
  } catch (err) {
    logger.warning(`evidence check failed: ${errorMessage(err)}`);
    return null;
  }
}

function heuristicOutcome(result: ReturnType<typeof heuristicTriage>): TriageOutcome {
  return {
    status: "ok",
    result,
    usage: zeroUsage(0),
    trace: [],
    turns: 0,
    stopCause: "complete",
    modelUsed: "heuristic",
  };
}

function zeroUsage(costUsd: number | null): UsageTotals {
  return { requests: 0, inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, costUsd };
}

/** Warnings stay visible (prefixed with the case); info and debug would drown the progress lines. */
function caseLogger(prefix: string): AgentLogger {
  return {
    info: () => {},
    debug: () => {},
    warning: (msg) => console.warn(`  [${prefix}] warning: ${msg}`),
  };
}

export async function main(
  argv: readonly string[],
  env: NodeJS.ProcessEnv = process.env,
  fixturesDir: string = FIXTURES_DIR,
): Promise<number> {
  let command: CliCommand;
  try {
    command = parseCliArgs(argv);
  } catch (err) {
    if (!(err instanceof UsageError)) throw err;
    console.error(`${err.message}\n\n${USAGE}`);
    return 1;
  }
  if (command.kind === "help") {
    console.log(USAGE);
    return 0;
  }

  const { options } = command;
  const apiKey = env.ANTHROPIC_API_KEY?.trim() || undefined;
  if (!options.heuristic && apiKey === undefined) {
    console.error("ANTHROPIC_API_KEY is not set. Export it, or pass --heuristic for the no-LLM baseline.");
    return 1;
  }

  let fixtures: LoadedFixture[];
  try {
    fixtures = loadFixtures(fixturesDir, options.only ?? undefined);
  } catch (err) {
    console.error(`Could not load fixtures: ${errorMessage(err)}`);
    return 1;
  }
  if (fixtures.length === 0) {
    console.error(`No fixtures found in ${fixturesDir}`);
    return 1;
  }

  // Checked before any case runs: finding out afterwards would throw away a run that was paid for.
  try {
    await mkdir(options.outDir, { recursive: true });
    await access(options.outDir, constants.W_OK);
  } catch (err) {
    console.error(`Cannot write reports to ${options.outDir}: ${errorMessage(err)}`);
    return 1;
  }

  const specs = fixtures.flatMap((fixture) =>
    Array.from({ length: options.repeat }, (_, i): CaseSpec => ({ fixture, repeat: i + 1 })),
  );
  const what = options.heuristic ? "heuristic baseline" : `${options.model} (effort ${options.effort})`;
  console.log(`Running ${specs.length} case(s) with ${what}, concurrency ${options.concurrency}\n`);

  let done = 0;
  const records = await mapWithConcurrency(specs, options.concurrency, async (spec) => {
    const record = await runCase(spec, options, apiKey);
    console.log(formatProgressLine(++done, specs.length, record));
    return record;
  });

  const header = reportHeader(options, fixtures.length, new Date().toISOString().slice(0, 10));
  const summary = summarize(records);
  // Printed before the files are written, so the results survive a failed write.
  console.log(`\n${renderConsoleTable(records)}\n`);
  console.log(
    `Passed ${summary.passed}/${summary.cases} (${formatPercent(summary.passRate)}) · ` +
      `total ${formatUsd(summary.cost.total)} · mean ${summary.meanTurns.toFixed(1)} turns · ` +
      `p50 ${formatDuration(summary.latencyMs.p50)}, p95 ${formatDuration(summary.latencyMs.p95)}`,
  );
  if (summary.evidence.cases > 0) console.log(`Evidence: ${evidenceMetric(summary.evidence)}`);

  const jsonPath = join(options.outDir, `${options.label}.json`);
  const mdPath = join(options.outDir, `${options.label}.md`);
  await writeFile(jsonPath, `${JSON.stringify({ header, summary, records }, null, 2)}\n`);
  await writeFile(mdPath, renderMarkdownReport(header, summary, records));
  console.log(`Wrote ${mdPath}\n      ${jsonPath}`);
  return 0;
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function isEntryPoint(): boolean {
  const entry = process.argv[1];
  if (entry === undefined) return false;
  try {
    return realpathSync(entry) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}

if (isEntryPoint()) {
  main(process.argv.slice(2)).then(
    (code) => {
      process.exitCode = code;
    },
    (err: unknown) => {
      console.error(err);
      process.exitCode = 1;
    },
  );
}
