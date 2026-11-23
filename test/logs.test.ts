import { describe, expect, it } from "vitest";
import { extractExcerpt, formatLines, parseJobLog, rankSignals } from "../src/logs.js";
import type { JobInfo, LogExcerpt, LogView, StepInfo } from "../src/types.js";

// ---------------------------------------------------------------------------
// Builders: raw logs in GitHub's format ("<7-digit-fraction timestamp> <text>")
// ---------------------------------------------------------------------------

const BASE_MS = Date.UTC(2026, 2, 2, 10, 0, 0);

/** Log-line timestamp `offset` seconds after 10:00:00, with GitHub's 7 fractional digits. */
function ts(offset: number): string {
  return new Date(BASE_MS + Math.round(offset * 1000)).toISOString().replace("Z", "0000Z");
}

/** Jobs-API step time: second precision. */
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

function jobWith(steps: StepInfo[], overrides: Partial<JobInfo> = {}): JobInfo {
  return {
    id: 101,
    name: "test (20.x)",
    status: "completed",
    conclusion: "failure",
    startedAt: stepTime(0),
    completedAt: stepTime(46),
    runnerLabels: ["ubuntu-latest"],
    htmlUrl: "https://github.com/example-org/webapp/actions/runs/1/job/101",
    steps,
    ...overrides,
  };
}

const JOB = jobWith([
  step(1, "Set up job", "success", 0, 2),
  step(2, "Run actions/checkout@v4", "success", 2, 4),
  step(3, "Install dependencies", "success", 4, 20),
  step(4, "Run tests", "failure", 20, 45),
  step(5, "Post Run actions/checkout@v4", "success", 45, 46),
  step(6, "Complete job", "success", 46, 46),
]);

class LogBuilder {
  private readonly lines: string[] = [];

  at(offset: number, ...texts: string[]): this {
    for (const text of texts) this.lines.push(`${ts(offset)} ${text}`);
    return this;
  }

  untimestamped(text: string): this {
    this.lines.push(text);
    return this;
  }

  build({ bom = false } = {}): string {
    return (bom ? "﻿" : "") + this.lines.join("\n") + "\n";
  }
}

/** A realistic failing Node job: setup, checkout, install, a failing test step, post steps. */
function realisticLog(): string {
  return new LogBuilder()
    .at(0.1, "Current runner version: '2.321.0'")
    .at(0.2, "##[group]Operating System", "Ubuntu", "22.04.5", "LTS", "##[endgroup]")
    .at(1.5, "##[debug]Evaluating condition for step: 'Run actions/checkout@v4'")
    .at(2.3, "##[group]Run actions/checkout@v4", "with:", "  repository: example-org/webapp", "##[endgroup]")
    .at(3.1, "Syncing repository: example-org/webapp")
    .at(4.2, "##[group]Run npm ci", '\u001b[36;1mnpm ci || echo "error: install failed"\u001b[0m')
    .at(4.2, "shell: /usr/bin/bash -e {0}", "##[endgroup]")
    .at(5, "npm warn deprecated inflight@1.0.6: This module is not supported")
    .at(6, "Downloading 10%\rDownloading 55%\rDownloading 100%")
    .at(19, "added 812 packages in 15s\r")
    .at(20.5, "##[group]Run npm test", "\u001b[36;1mnpm test\u001b[0m", "##[endgroup]")
    .at(21, "> webapp@1.0.0 test", "> vitest run")
    .at(22, "\u001b[32m ✓\u001b[39m test/error-handling.test.ts (12 tests) 31ms")
    .at(23, "\u001b]8;;https://example.com\u0007link\u001b]8;;\u0007 Retrying request (attempt 2/3)")
    .at(24, " FAIL  test/cart.test.ts > applyDiscount > rounds after subtracting")
    .at(24, "AssertionError: expected 89.99 to be 90 // Object.is equality")
    .untimestamped("    at test/cart.test.ts:42:31")
    .at(25, "##[error]Process completed with exit code 1.")
    .at(45.4, "Post job cleanup.")
    .at(46.2, "Cleaning up orphan processes")
    .build({ bom: true });
}

function lineOf(view: LogView, text: string): number {
  const found = view.all().find((line) => line.text === text);
  if (!found) throw new Error(`line not found: ${text}`);
  return found.n;
}

function excerptLineCount(excerpt: LogExcerpt): number {
  return excerpt.ranges.reduce((sum, r) => sum + r.lines.length, 0);
}

function covered(excerpt: LogExcerpt, n: number): boolean {
  return excerpt.ranges.some((r) => r.start <= n && n <= r.end);
}

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

describe("parseJobLog", () => {
  it("strips the BOM, timestamps, ANSI escapes and carriage-return progress output", () => {
    const view = parseJobLog(realisticLog(), JOB);
    const texts = view.all().map((line) => line.text);

    expect(texts[0]).toBe("Current runner version: '2.321.0'");
    expect(texts).toContain("Downloading 100%");
    expect(texts).toContain("added 812 packages in 15s");
    expect(texts).toContain(" ✓ test/error-handling.test.ts (12 tests) 31ms");
    expect(texts).toContain("link Retrying request (attempt 2/3)");
    expect(texts).toContain("##[error]Process completed with exit code 1.");
    for (const text of texts) {
      expect(text).not.toMatch(/[\u001b\r﻿]/);
      expect(text).not.toMatch(/^\d{4}-\d{2}-\d{2}T/);
    }
  });

  it("numbers lines from 1 in normalized order", () => {
    const view = parseJobLog(realisticLog(), JOB);
    expect(view.lineCount).toBe(view.all().length);
    expect(view.all().map((line) => line.n)).toEqual(Array.from({ length: view.lineCount }, (_, i) => i + 1));
    expect(view.jobId).toBe(101);
    expect(view.jobName).toBe("test (20.x)");
    expect(view.truncated).toBe(false);
  });

  it("attributes lines to steps, preferring the latest-starting step at second boundaries", () => {
    const view = parseJobLog(realisticLog(), JOB);

    expect(view.stepOf(lineOf(view, "Current runner version: '2.321.0'"))).toBe(1);
    // 10:00:02.3 is inside both "Set up job" (ends 02 + 1s grace) and checkout (starts 02).
    expect(view.stepOf(lineOf(view, "##[group]Run actions/checkout@v4"))).toBe(2);
    expect(view.stepOf(lineOf(view, "Syncing repository: example-org/webapp"))).toBe(2);
    expect(view.stepOf(lineOf(view, "##[group]Run npm ci"))).toBe(3);
    expect(view.stepOf(lineOf(view, "##[group]Run npm test"))).toBe(4);
    expect(view.stepOf(lineOf(view, "##[error]Process completed with exit code 1."))).toBe(4);
    expect(view.stepOf(lineOf(view, "Post job cleanup."))).toBe(5);
    expect(view.stepOf(lineOf(view, "Cleaning up orphan processes"))).toBe(6);
  });

  it("gives lines without a timestamp the previous line's step", () => {
    const view = parseJobLog(realisticLog(), JOB);
    expect(view.stepOf(lineOf(view, "    at test/cart.test.ts:42:31"))).toBe(4);
  });

  it("exposes each step's line range", () => {
    const view = parseJobLog(realisticLog(), JOB);
    expect(view.stepRange(4)).toEqual({
      start: lineOf(view, "##[group]Run npm test"),
      end: lineOf(view, "##[error]Process completed with exit code 1."),
    });
    expect(view.stepRange(99)).toBeNull();
  });

  it("returns null for lines outside every step window and for out-of-range line numbers", () => {
    const raw = new LogBuilder()
      .untimestamped("preamble without a timestamp")
      .at(-30, "before the job started")
      .at(0.5, "inside step 1")
      .build();
    const view = parseJobLog(raw, JOB);
    expect(view.stepOf(1)).toBeNull();
    expect(view.stepOf(2)).toBeNull();
    expect(view.stepOf(3)).toBe(1);
    expect(view.stepOf(0)).toBeNull();
    expect(view.stepOf(4)).toBeNull();
  });

  it("treats a step without completedAt as still running", () => {
    const job = jobWith([{ ...step(1, "Run tests", "cancelled", 0, 0), completedAt: null }]);
    const view = parseJobLog(new LogBuilder().at(500, "still going").build(), job);
    expect(view.stepOf(1)).toBe(1);
  });

  it("handles CRLF line endings and an empty log", () => {
    const view = parseJobLog(`${ts(0.5)} first\r\n${ts(0.6)} second\r\n`, JOB);
    expect(view.all().map((line) => line.text)).toEqual(["first", "second"]);

    const empty = parseJobLog("", JOB);
    expect(empty.lineCount).toBe(0);
    expect(empty.all()).toEqual([]);
    expect(empty.slice(1, 10)).toEqual([]);
  });

  it("caps each line at 2000 characters", () => {
    const view = parseJobLog(`${ts(21)} ${"x".repeat(5000)}\n${ts(21)} short\n`, JOB);
    const [long, short] = view.all();
    expect(long?.text).toBe(`${"x".repeat(2000)}…[truncated]`);
    expect(short?.text).toBe("short");
  });

  it("keeps the first 10% and last 90% of the byte budget of an oversized log", () => {
    // Untimestamped, so normalized text equals the raw text and byte counts can be checked.
    const original = Array.from(
      { length: 1000 },
      (_, i) => `line ${String(i + 1).padStart(4, "0")} café ${"=".repeat(30)}`,
    );
    const raw = original.join("\n") + "\n";
    const maxBytes = 10_000;
    const view = parseJobLog(raw, jobWith([]), { maxBytes });
    const texts = view.all().map((line) => line.text);

    expect(view.truncated).toBe(true);
    const markers = texts.filter((text) => /^… \[\d+ bytes omitted by ci-triage-agent\] …$/.test(text));
    expect(markers).toHaveLength(1);

    const markerIndex = texts.indexOf(markers[0] ?? "");
    const head = texts.slice(0, markerIndex);
    const tail = texts.slice(markerIndex + 1);
    const bytes = (lines: string[]) => lines.reduce((sum, text) => sum + Buffer.byteLength(`${text}\n`), 0);

    expect(head[0]).toBe(original[0]);
    expect(tail.at(-1)).toBe(original.at(-1));
    expect(bytes(head)).toBeLessThanOrEqual(maxBytes * 0.1);
    expect(bytes(tail)).toBeLessThanOrEqual(maxBytes * 0.9);
    expect(bytes(tail)).toBeGreaterThan(maxBytes * 0.9 - 100);
    // Every kept line is a whole original line (no split UTF-8 sequences, no partial lines).
    for (const text of [...head, ...tail]) expect(original).toContain(text);

    const omitted = Number(/\[(\d+) bytes/.exec(markers[0] ?? "")?.[1]);
    expect(omitted).toBe(Buffer.byteLength(raw) - bytes(head) - bytes(tail));
  });

  it("does not truncate a log within the budget", () => {
    const view = parseJobLog(realisticLog(), JOB, { maxBytes: 1_000_000 });
    expect(view.truncated).toBe(false);
    expect(view.all().some((line) => line.text.includes("bytes omitted"))).toBe(false);
  });

  it("strips tput's charset reset, cursor save/restore and stray ESC bytes", () => {
    const raw = `${ts(21)} \u001b[1m\u001b[31mError: boom\u001b(B\u001b[m\n${ts(21)} \u001b7saved\u001b8 \u001b\n`;
    const view = parseJobLog(raw, JOB);
    expect(view.all().map((line) => line.text)).toEqual(["Error: boom", "saved "]);
  });

  it("does not let a skipped step claim the failing step's last lines", () => {
    // GitHub stamps skipped steps with the time the failing step ended.
    const job = jobWith([
      step(1, "Set up job", "success", 0, 2),
      step(2, "Run tests", "failure", 2, 45),
      step(3, "Upload coverage", "skipped", 45, 45),
      step(4, "Complete job", "success", 46, 46),
    ]);
    const raw = new LogBuilder()
      .at(44.9, "FAIL test/cart.test.ts")
      .at(45.3, "AssertionError: expected 1 to be 2")
      .at(45.4, "##[error]Process completed with exit code 1.")
      .build();
    const view = parseJobLog(raw, job);
    expect([1, 2, 3].map((n) => view.stepOf(n))).toEqual([2, 2, 2]);
    expect(view.stepRange(2)).toEqual({ start: 1, end: 3 });
    expect(view.stepRange(3)).toBeNull();
  });

  it("keeps the tail when the first line alone exceeds the head budget", () => {
    const raw = `${"h".repeat(5000)}\n${Array.from({ length: 50 }, (_, i) => `tail ${i}`).join("\n")}\n`;
    const view = parseJobLog(raw, jobWith([]), { maxBytes: 2000 });
    const texts = view.all().map((line) => line.text);
    expect(texts[0]).toMatch(/^… \[\d+ bytes omitted by ci-triage-agent\] …$/);
    expect(texts.at(-1)).toBe("tail 49");
    expect(texts.some((text) => text.startsWith("hhh"))).toBe(false);
  });

  it("handles a truncated log with hundreds of thousands of lines", () => {
    const view = parseJobLog("ok\n".repeat(400_000), jobWith([]), { maxBytes: 900_000 });
    expect(view.truncated).toBe(true);
    expect(view.lineCount).toBeGreaterThan(250_000);
  });
});

// ---------------------------------------------------------------------------
// Search and slice
// ---------------------------------------------------------------------------

describe("LogView.search", () => {
  const view = parseJobLog(realisticLog(), JOB);

  it("does a literal, case-insensitive search with 3 lines of context by default", () => {
    const result = view.search("assertionerror: expected");
    const n = lineOf(view, "AssertionError: expected 89.99 to be 90 // Object.is equality");

    expect(result.totalMatches).toBe(1);
    expect(result.truncated).toBe(false);
    expect(result.note).toBeUndefined();
    expect(result.matches[0]?.line).toBe(n);
    expect(result.matches[0]?.context.map((line) => line.n)).toEqual([
      n - 3,
      n - 2,
      n - 1,
      n,
      n + 1,
      n + 2,
      n + 3,
    ]);
  });

  it("treats regex metacharacters literally unless regex is set", () => {
    expect(view.search("exit code 1.").totalMatches).toBe(1);
    expect(view.search("exit code \\d").totalMatches).toBe(0);
    expect(view.search("exit code \\d+\\.", { regex: true }).totalMatches).toBe(1);
  });

  it("honours caseSensitive for literal and regex searches", () => {
    expect(view.search("assertionerror", { caseSensitive: true }).totalMatches).toBe(0);
    expect(view.search("AssertionError", { caseSensitive: true }).totalMatches).toBe(1);
    expect(view.search("^assertion", { regex: true, caseSensitive: true }).totalMatches).toBe(0);
    expect(view.search("^assertion", { regex: true }).totalMatches).toBe(1);
  });

  it("falls back to a literal search with a note when the regex is invalid", () => {
    const result = view.search("(attempt 2", { regex: true });
    expect(result.note).toMatch(/invalid regular expression.*literal/);
    expect(result.totalMatches).toBe(1);
    expect(result.matches[0]?.line).toBe(lineOf(view, "link Retrying request (attempt 2/3)"));
  });

  it("interrupts a catastrophically backtracking regex instead of hanging", () => {
    const evil = parseJobLog(`${"a".repeat(40)}!\nplain line\n`, jobWith([]));
    const started = Date.now();
    const result = evil.search("^(a+)+$", { regex: true });
    expect(Date.now() - started).toBeLessThan(5000);
    expect(result.note).toMatch(/took longer than .*literal/);
    expect(result.totalMatches).toBe(0);
  });

  it("clamps context to 0..20 lines and the log bounds", () => {
    const numbered = parseJobLog(
      Array.from({ length: 100 }, (_, i) => `row ${i + 1}`).join("\n"),
      jobWith([]),
    );
    expect(numbered.search("row 50", { context: 0 }).matches[0]?.context.map((l) => l.n)).toEqual([50]);
    expect(numbered.search("row 50", { context: 99 }).matches[0]?.context).toHaveLength(41);
    expect(
      numbered.search("row 2", { context: 5, maxMatches: 1 }).matches[0]?.context.map((l) => l.n),
    ).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it("caps matches at maxMatches (default 20, max 50) while counting every match", () => {
    const many = parseJobLog(Array.from({ length: 120 }, (_, i) => `retry ${i}`).join("\n"), jobWith([]));

    const byDefault = many.search("retry");
    expect(byDefault.totalMatches).toBe(120);
    expect(byDefault.matches).toHaveLength(20);
    expect(byDefault.truncated).toBe(true);
    expect(byDefault.matches.map((m) => m.line)).toEqual(Array.from({ length: 20 }, (_, i) => i + 1));

    expect(many.search("retry", { maxMatches: 5 }).matches).toHaveLength(5);
    expect(many.search("retry", { maxMatches: 500 }).matches).toHaveLength(50);
    expect(many.search("retry 7", { maxMatches: 50 }).truncated).toBe(false);
  });

  it("restricts matches to one step when step is given", () => {
    const all = view.search("npm");
    const inInstall = view.search("npm", { step: 3 });
    expect(all.totalMatches).toBeGreaterThan(inInstall.totalMatches);
    expect(inInstall.totalMatches).toBeGreaterThan(0);
    for (const match of inInstall.matches) expect(view.stepOf(match.line)).toBe(3);
  });

  it("caps the pattern at 300 characters and ignores an empty pattern", () => {
    const long = view.search(`Syncing repository${"!".repeat(400)}`);
    expect(long.note).toMatch(/truncated to 300/);
    expect(long.totalMatches).toBe(0);

    const empty = view.search("");
    expect(empty.totalMatches).toBe(0);
    expect(empty.note).toMatch(/empty pattern/);
  });
});

describe("LogView.slice", () => {
  const view = parseJobLog(Array.from({ length: 1000 }, (_, i) => `row ${i + 1}`).join("\n"), jobWith([]));

  it("is inclusive and clamped to the log", () => {
    expect(view.slice(-5, 3).map((l) => l.n)).toEqual([1, 2, 3]);
    expect(view.slice(998, 5000).map((l) => l.text)).toEqual(["row 998", "row 999", "row 1000"]);
    expect(view.slice(42, 42)).toEqual([{ n: 42, text: "row 42" }]);
  });

  it("returns at most 400 lines and nothing for an inverted range", () => {
    const slice = view.slice(1, 10_000);
    expect(slice).toHaveLength(400);
    expect(slice.at(-1)?.n).toBe(400);
    expect(view.slice(10, 5)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Excerpt
// ---------------------------------------------------------------------------

/**
 * ~3000 lines: a long install step with a deprecation "Error:" (succeeded step), a long
 * test step with noise, a repeated retry error, a type error annotation and an assertion
 * failure far from the end, then post steps with their own noise.
 */
function largeFailingLog() {
  const markers = {
    installNoise: "Error: deprecated package 'request' will stop working",
    retry: "Error: connect ECONNREFUSED 127.0.0.1:5432",
    typeError:
      "##[error]src/cart.ts(12,5): error TS2345: Argument of type 'string' is not assignable to parameter of type 'number'.",
    assertion: "AssertionError: expected 89.99 to be 90",
    debug: "##[debug]error: a debug-only message",
    exit: "##[error]Process completed with exit code 1.",
    postNoise: "##[warning]Error: Cache service responded with 503",
  } as const;
  const log = new LogBuilder().at(0.5, "Current runner version: '2.321.0'");
  for (let i = 0; i < 1000; i++) {
    log.at(
      4 + (i / 1000) * 15,
      i === 300 ? markers.installNoise : `npm http fetch GET 200 https://registry.npmjs.org/pkg-${i}`,
    );
  }
  for (let i = 0; i < 1900; i++) {
    let text = `  test/suite-${i}.test.ts > case ${i} passed`;
    if (i >= 200 && i < 220) text = markers.retry; // identical lines: only the first is a signal
    if (i === 600) text = markers.debug;
    if (i === 900) text = markers.typeError;
    if (i === 1500) text = markers.assertion;
    log.at(20.5 + (i / 1900) * 24, text);
  }
  log.at(44.9, markers.exit);
  log.at(45.5, markers.postNoise, "Post job cleanup.");
  log.at(46.1, "Cleaning up orphan processes");
  return { raw: log.build(), markers };
}

describe("extractExcerpt", () => {
  it("returns the whole log when it fits the budget", () => {
    const view = parseJobLog(realisticLog(), JOB);
    const excerpt = extractExcerpt(view, JOB);

    expect(excerpt.ranges).toHaveLength(1);
    expect(excerpt.ranges[0]).toMatchObject({ start: 1, end: view.lineCount });
    expect(excerpt.ranges[0]?.lines).toEqual(view.all());
    expect(excerpt.failedSteps).toEqual(["Run tests"]);
    expect(excerpt.totalLines).toBe(view.lineCount);
    expect(excerpt.signalLines).toEqual(
      expect.arrayContaining([
        lineOf(view, " FAIL  test/cart.test.ts > applyDiscount > rounds after subtracting"),
        lineOf(view, "AssertionError: expected 89.99 to be 90 // Object.is equality"),
        lineOf(view, "##[error]Process completed with exit code 1."),
      ]),
    );
  });

  it("ignores debug lines, passing-test lines and echoed step scripts as signals", () => {
    const view = parseJobLog(realisticLog(), JOB);
    const { signalLines } = extractExcerpt(view, JOB);
    expect(signalLines).not.toContain(lineOf(view, " ✓ test/error-handling.test.ts (12 tests) 31ms"));
    expect(signalLines).not.toContain(lineOf(view, 'npm ci || echo "error: install failed"'));
  });

  it("stays within the line budget and returns merged ranges in log order", () => {
    const { raw } = largeFailingLog();
    const view = parseJobLog(raw, JOB);
    const excerpt = extractExcerpt(view, JOB);

    expect(view.lineCount).toBeGreaterThan(2900);
    expect(excerpt.totalLines).toBe(view.lineCount);
    expect(excerptLineCount(excerpt)).toBeLessThanOrEqual(160);
    excerpt.ranges.forEach((range, i) => {
      expect(range.lines).toEqual(view.all().slice(range.start - 1, range.end));
      const next = excerpt.ranges[i + 1];
      // Overlapping and adjacent windows are merged, so a gap always separates ranges.
      if (next) expect(next.start).toBeGreaterThan(range.end + 1);
    });
    expect(excerpt.signalLines).toEqual([...excerpt.signalLines].sort((a, b) => a - b));
  });

  it("includes the failed step's tail and the strongest signals with context", () => {
    const { raw, markers } = largeFailingLog();
    const view = parseJobLog(raw, JOB);
    const excerpt = extractExcerpt(view, JOB);
    const tailEnd = view.stepRange(4)?.end ?? 0;

    for (let n = tailEnd - 29; n <= tailEnd; n++) expect(covered(excerpt, n)).toBe(true);
    const typeError = lineOf(view, markers.typeError);
    const assertion = lineOf(view, markers.assertion);
    for (const n of [typeError - 8, typeError, typeError + 8, assertion - 8, assertion + 8]) {
      expect(covered(excerpt, n)).toBe(true);
    }
    expect(excerpt.signalLines).toEqual(expect.arrayContaining([typeError, assertion]));
  });

  it("counts a repeated identical line once and skips debug lines", () => {
    const { raw, markers } = largeFailingLog();
    const view = parseJobLog(raw, JOB);
    const excerpt = extractExcerpt(view, JOB);
    const retryLines = view
      .all()
      .filter((line) => line.text === markers.retry)
      .map((line) => line.n);

    expect(retryLines).toHaveLength(20);
    expect(excerpt.signalLines).toContain(retryLines[0]);
    for (const n of retryLines.slice(1)) expect(excerpt.signalLines).not.toContain(n);
    expect(excerpt.signalLines).not.toContain(lineOf(view, markers.debug));
  });

  it("drops signals outside failed steps first when the budget is tight", () => {
    const { raw, markers } = largeFailingLog();
    const view = parseJobLog(raw, JOB);
    const excerpt = extractExcerpt(view, JOB, { maxLines: 38 });

    expect(excerptLineCount(excerpt)).toBe(38);
    expect(covered(excerpt, view.stepRange(4)?.end ?? 0)).toBe(true);
    expect(excerpt.signalLines).toEqual(
      expect.arrayContaining(
        [markers.typeError, markers.assertion, markers.retry].map((m) => lineOf(view, m)),
      ),
    );
    expect(excerpt.signalLines).not.toContain(lineOf(view, markers.installNoise));
    expect(excerpt.signalLines).not.toContain(lineOf(view, markers.postNoise));
  });

  it("ranks signals inside failed steps above the same signals elsewhere", () => {
    const { raw, markers } = largeFailingLog();
    const view = parseJobLog(raw, JOB);
    const ranked = rankSignals(view, JOB);
    const position = (text: string) => ranked.findIndex((s) => s.text === text);

    expect(ranked[0]?.text).toBe(markers.typeError);
    expect(position(markers.retry)).toBeLessThan(position(markers.installNoise));
    expect(position(markers.installNoise)).toBeLessThan(position(markers.postNoise));
  });

  it("merges windows of nearby signals into one range", () => {
    const lines = Array.from({ length: 400 }, (_, i) => `ok line ${i + 1}`);
    lines[99] = "Error: first problem";
    lines[104] = "Error: second problem";
    const view = parseJobLog(lines.join("\n"), jobWith([]));
    const excerpt = extractExcerpt(view, jobWith([]), { maxLines: 80 });

    const merged = excerpt.ranges.find((r) => r.start <= 100 && 105 <= r.end);
    expect(merged).toMatchObject({ start: 92, end: 113 });
    expect(excerpt.signalLines).toEqual([100, 105]);
  });

  it("uses the end of the log when no step attribution exists", () => {
    const lines = Array.from({ length: 500 }, (_, i) => `output ${i + 1}`);
    const view = parseJobLog(lines.join("\n"), jobWith([]));
    const excerpt = extractExcerpt(view, jobWith([]));

    expect(excerpt.failedSteps).toEqual([]);
    expect(excerpt.ranges).toEqual([{ start: 471, end: 500, lines: view.slice(471, 500) }]);
    expect(excerpt.signalLines).toEqual([]);
  });

  it("still returns the tail when the budget is smaller than the minimum tail", () => {
    const view = parseJobLog(
      Array.from({ length: 100 }, (_, i) => `output ${i + 1}`).join("\n"),
      jobWith([]),
    );
    expect(extractExcerpt(view, jobWith([]), { maxLines: 3 }).ranges).toEqual([
      { start: 98, end: 100, lines: view.slice(98, 100) },
    ]);
  });

  it("handles an empty log", () => {
    const excerpt = extractExcerpt(parseJobLog("", JOB), JOB);
    expect(excerpt).toEqual({ failedSteps: ["Run tests"], ranges: [], signalLines: [], totalLines: 0 });
  });

  it("does not let a step's unterminated ::group::Run hide the error after it", () => {
    // The script opened its own "Run …" group and died inside it, so no ##[endgroup] follows
    // until the next step's header.
    const lines = [
      "##[group]Run ./deploy.sh",
      "./deploy.sh",
      "shell: /usr/bin/bash -e {0}",
      "##[endgroup]",
      "##[group]Run database migrations",
      'Error: relation "users" does not exist',
      "##[error]Process completed with exit code 1.",
      "##[group]Run actions/cache/save@v4",
      "with:",
      "  path: ~/.npm",
      "##[endgroup]",
    ];
    const view = parseJobLog(lines.join("\n"), jobWith([]));
    const { signalLines } = extractExcerpt(view, jobWith([]));
    expect(signalLines).toEqual([6, 7]);
  });

  it("keeps every invariant on randomized logs and budgets", () => {
    let seed = 7;
    const random = () => (seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31;
    for (let round = 0; round < 150; round++) {
      const stepCount = 1 + Math.floor(random() * 5);
      const steps = Array.from({ length: stepCount }, (_, i) =>
        step(
          i + 1,
          i === 0 ? "Set up job" : `step ${i}`,
          random() < 0.4 ? "failure" : "success",
          i * 10,
          i * 10 + 9,
        ),
      );
      const job = jobWith(steps);
      const lineCount = Math.floor(random() * 2000);
      const log = new LogBuilder();
      for (let i = 0; i < lineCount; i++) {
        const r = random();
        const text = r < 0.02 ? `##[error]failure ${i}` : r < 0.06 ? `Error: boom ${i % 7}` : `ok ${i}`;
        if (random() < 0.1) log.untimestamped(text);
        else log.at((i / lineCount) * stepCount * 10, text);
      }
      const view = parseJobLog(log.build(), job);
      const maxLines = 1 + Math.floor(random() * 250);
      const excerpt = extractExcerpt(view, job, { maxLines });

      expect(excerptLineCount(excerpt)).toBeLessThanOrEqual(maxLines);
      if (view.lineCount > 0) expect(excerpt.ranges.length).toBeGreaterThan(0);
      excerpt.ranges.forEach((range, i) => {
        expect(range.lines).toEqual(view.all().slice(range.start - 1, range.end));
        const next = excerpt.ranges[i + 1];
        if (next) expect(next.start).toBeGreaterThan(range.end + 1);
      });
      expect(new Set(excerpt.signalLines).size).toBe(excerpt.signalLines.length);
      for (const n of excerpt.signalLines) expect(covered(excerpt, n)).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

describe("formatLines", () => {
  it("right-aligns line numbers to the widest one", () => {
    const text = formatLines([
      { n: 7, text: "first" },
      { n: 120, text: "##[error]second" },
    ]);
    expect(text).toBe("    7 | first\n  120 | ##[error]second");
  });

  it("returns an empty string for no lines", () => {
    expect(formatLines([])).toBe("");
  });
});

describe("cache download progress is not an error signal", () => {
  it("ignores 'Received N of M' lines from @actions/cache", () => {
    const raw = new LogBuilder()
      .at(5, "Received 84934656 of 84934656 (100.0%), 80.9 MBs/sec", "Cache restored successfully")
      .at(30, "  Expected: 90", "  Received: 100")
      .build();
    const view = parseJobLog(raw, JOB);
    const lines = rankSignals(view, JOB).map((s) => s.text);
    expect(lines.some((t) => t.startsWith("Received 84934656"))).toBe(false);
    expect(lines.some((t) => t.includes("Received: 100"))).toBe(true);
  });
});
