import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createFixtureBackend, loadFixtures, normalizeRepoPath } from "../evals/fixture.js";
import type { FixtureExpectation, FixtureFile, LoadedFixture } from "../evals/fixture.js";
import { grade } from "../evals/grade.js";
import {
  DEFAULT_OUT_DIR,
  UsageError,
  failureReasons,
  formatEvidence,
  formatProgressLine,
  main,
  mapWithConcurrency,
  median,
  parseCliArgs,
  percentile,
  renderConsoleTable,
  renderMarkdownReport,
  reportHeader,
  summarize,
  summarizeTools,
  toCaseRecord,
} from "../evals/run-evals.js";
import type { CaseRecord, EvalOptions } from "../evals/run-evals.js";
import type { TriageOutcome, TriageResult, UsageTotals } from "../src/types.js";

const FIXTURES = fileURLToPath(new URL("./fixtures/", import.meta.url));
const MINI = join(FIXTURES, "mini");
const HEAD = "a1b2c3d4e5f60718293a4b5c6d7e8f9012345678";

// ---------------------------------------------------------------------------
// Temp fixture roots
// ---------------------------------------------------------------------------

let scratch: string[] = [];

afterEach(() => {
  for (const dir of scratch) rmSync(dir, { recursive: true, force: true });
  scratch = [];
});

/** A fresh root holding copies of the mini fixture, one per entry (dir name -> fixture.json edit). */
function makeRoot(fixtures: Record<string, (json: FixtureFile) => unknown> = { mini: (f) => f }): string {
  const root = mkdtempSync(join(tmpdir(), "evals-test-"));
  scratch.push(root);
  for (const [dirName, edit] of Object.entries(fixtures)) {
    const dir = join(root, dirName);
    cpSync(MINI, dir, { recursive: true });
    const json = JSON.parse(readFileSync(join(dir, "fixture.json"), "utf8")) as FixtureFile;
    writeFileSync(join(dir, "fixture.json"), JSON.stringify(edit(json), null, 2));
  }
  return root;
}

function loadMini(): LoadedFixture {
  const [fixture] = loadFixtures(FIXTURES, ["mini"]);
  if (fixture === undefined) throw new Error("mini fixture missing");
  return fixture;
}

// ---------------------------------------------------------------------------
// loadFixtures
// ---------------------------------------------------------------------------

describe("loadFixtures", () => {
  it("loads and validates the mini fixture", () => {
    const fixture = loadMini();
    expect(fixture.dir).toBe(MINI);
    expect(fixture.file.id).toBe("mini");
    expect(fixture.file.repo).toEqual({ owner: "example-org", repo: "acme-api" });
    expect(fixture.file.expected.categories).toEqual(["code"]);
    expect(fixture.file.history.test).toHaveLength(3);
  });

  it("returns fixtures sorted by id, not directory name, and skips other entries", () => {
    const root = makeRoot({
      "a-dir": (f) => ({ ...f, id: "zeta" }),
      "b-dir": (f) => ({ ...f, id: "alpha" }),
    });
    mkdirSync(join(root, "not-a-fixture"));
    writeFileSync(join(root, "notes.txt"), "ignored");

    const loaded = loadFixtures(root);
    expect(loaded.map((f) => f.file.id)).toEqual(["alpha", "zeta"]);
    expect(loaded.map((f) => f.dir)).toEqual([join(root, "b-dir"), join(root, "a-dir")]);
  });

  it("filters by --only ids", () => {
    const root = makeRoot({ one: (f) => ({ ...f, id: "one" }), two: (f) => ({ ...f, id: "two" }) });
    expect(loadFixtures(root, ["two"]).map((f) => f.file.id)).toEqual(["two"]);
    expect(loadFixtures(root, []).map((f) => f.file.id)).toEqual([]);
  });

  it("throws on an unknown --only id and lists the available ones", () => {
    const root = makeRoot();
    expect(() => loadFixtures(root, ["mini", "nope"])).toThrow(
      /Unknown fixture id\(s\): nope\. Available: mini/,
    );
  });

  it("names the fixture directory and the failing field path", () => {
    const root = makeRoot({
      broken: (f) => ({ ...f, run: { ...f.run, headSha: undefined } }),
    });
    expect(() => loadFixtures(root)).toThrow(/Fixture broken: invalid fixture\.json at run\.headSha/);
  });

  it("reports array indices in nested paths", () => {
    const root = makeRoot({
      broken: (f) => ({ ...f, jobs: [{ ...f.jobs[0], conclusion: 1 }] }),
    });
    expect(() => loadFixtures(root)).toThrow(/jobs\[0\]\.conclusion/);
  });

  it("rejects an unknown category", () => {
    const root = makeRoot({
      broken: (f) => ({ ...f, expected: { ...f.expected, categories: ["network"] } }),
    });
    expect(() => loadFixtures(root)).toThrow(/expected\.categories\[0\]/);
  });

  it("rejects a misspelled expectation key instead of ignoring it", () => {
    const root = makeRoot({
      broken: (f) => ({ ...f, expected: { categories: ["code"], keywords: [], fixpath: "src/discount.py" } }),
    });
    expect(() => loadFixtures(root)).toThrow(/Fixture broken: .*expected.*fixpath/);
  });

  it("rejects empty keyword groups", () => {
    const root = makeRoot({
      broken: (f) => ({ ...f, expected: { ...f.expected, keywords: [[]] } }),
    });
    expect(() => loadFixtures(root)).toThrow(/expected\.keywords\[0\]/);
  });

  it("reports invalid JSON with the directory name", () => {
    const root = makeRoot({ broken: (f) => f });
    writeFileSync(join(root, "broken", "fixture.json"), "{ not json");
    expect(() => loadFixtures(root)).toThrow(/Fixture broken: fixture\.json is not valid JSON/);
  });

  it("requires a log for every failed or timed-out job", () => {
    const root = makeRoot({ nolog: (f) => f });
    rmSync(join(root, "nolog", "logs", "101.log"));
    expect(() => loadFixtures(root)).toThrow(
      /Fixture nolog: failed job "test" \(id 101\) has no logs\/101\.log/,
    );

    const timedOut = makeRoot({
      slow: (f) => ({
        ...f,
        jobs: [...f.jobs, { ...f.jobs[1], id: 103, name: "e2e", conclusion: "timed_out" }],
      }),
    });
    expect(() => loadFixtures(timedOut)).toThrow(/failed job "e2e" \(id 103\) has no logs\/103\.log/);
  });

  it("does not require logs for jobs that succeeded", () => {
    // Job 102 ("lint") succeeded and has no log in the mini fixture.
    expect(() => loadMini()).not.toThrow();
  });

  it("rejects duplicate ids", () => {
    const root = makeRoot({ first: (f) => f, second: (f) => f });
    expect(() => loadFixtures(root)).toThrow(/Fixture id "mini" is used by both first and second/);
  });

  it("throws when the root is missing", () => {
    expect(() => loadFixtures(join(tmpdir(), "evals-test-does-not-exist"))).toThrow(/is not a directory/);
  });
});

// ---------------------------------------------------------------------------
// createFixtureBackend
// ---------------------------------------------------------------------------

describe("createFixtureBackend", () => {
  it("serves run, jobs and changed files from fixture.json", async () => {
    const fixture = loadMini();
    const backend = createFixtureBackend(fixture);
    expect(backend.repo).toEqual({ owner: "example-org", repo: "acme-api" });
    expect((await backend.getRun()).headSha).toBe(HEAD);
    expect((await backend.listJobs()).map((j) => j.name)).toEqual(["test", "lint"]);
    expect((await backend.getChangedFiles()).map((f) => f.path)).toEqual(["src/discount.py", "docs/OLD.md"]);
  });

  it("returns copies, so callers cannot corrupt later repeats", async () => {
    const fixture = loadMini();
    const backend = createFixtureBackend(fixture);
    (await backend.getRun()).headSha = "mutated";
    (await backend.listJobs()).pop();
    expect((await backend.getRun()).headSha).toBe(HEAD);
    expect(await backend.listJobs()).toHaveLength(2);
    expect(fixture.file.run.headSha).toBe(HEAD);
  });

  describe("getJobLog", () => {
    it("returns the raw log", async () => {
      const log = await createFixtureBackend(loadMini()).getJobLog(101);
      expect(log).toBe(readFileSync(join(MINI, "logs", "101.log"), "utf8"));
      expect(log).toMatch(/^2026-11-20T10:15:00\.0000000Z ##\[group\]Run actions\/checkout@v4/);
    });

    it("throws a clear error when the job has no log", async () => {
      await expect(createFixtureBackend(loadMini()).getJobLog(102)).rejects.toThrow(
        /Fixture mini: log for job "lint" \(id 102\) is not available/,
      );
    });

    it("throws for unknown job ids", async () => {
      await expect(createFixtureBackend(loadMini()).getJobLog(999)).rejects.toThrow(/no job with id 999/);
    });
  });

  describe("readFile", () => {
    it("serves repo/ at the HEAD SHA and at HEAD", async () => {
      const backend = createFixtureBackend(loadMini());
      const expected = readFileSync(join(MINI, "repo", "src", "discount.py"), "utf8");
      expect(await backend.readFile("src/discount.py", HEAD)).toBe(expected);
      expect(await backend.readFile("src/discount.py", "HEAD")).toBe(expected);
      expect(await backend.readFile("./src//discount.py", HEAD)).toBe(expected);
      expect(await backend.readFile("src/utils/money.py", HEAD)).toContain("def cents");
    });

    it("serves base/ on the default branch, falling back to repo/", async () => {
      const backend = createFixtureBackend(loadMini());
      expect(await backend.readFile("src/discount.py", "main")).toContain("// 100");
      expect(await backend.readFile("README.md", "main")).toContain("# acme-api");
      expect(await backend.readFile("docs/OLD.md", "main")).toContain("Removed by the change");
    });

    it("does not leak base-only files into the HEAD tree", async () => {
      expect(await createFixtureBackend(loadMini()).readFile("docs/OLD.md", HEAD)).toBeNull();
    });

    it("returns null for any other ref", async () => {
      const backend = createFixtureBackend(loadMini());
      expect(await backend.readFile("README.md", "feature/discount-rounding")).toBeNull();
      expect(await backend.readFile("README.md", "0f1e2d3c4b5a69788796a5b4c3d2e1f00f1e2d3c")).toBeNull();
    });

    it("returns null for missing files and directories", async () => {
      const backend = createFixtureBackend(loadMini());
      expect(await backend.readFile("src/missing.py", HEAD)).toBeNull();
      expect(await backend.readFile("src", HEAD)).toBeNull();
      expect(await backend.readFile("src/", HEAD)).toBeNull();
      expect(await backend.readFile("", HEAD)).toBeNull();
      expect(await backend.readFile(".", HEAD)).toBeNull();
    });

    it.each([
      "../fixture.json",
      "../logs/101.log",
      "src/../../fixture.json",
      "src/../README.md",
      "..",
      "/etc/passwd",
      "/README.md",
      "C:/Windows/win.ini",
      "src\\..\\..\\fixture.json",
      "README.md\0.txt",
    ])("rejects %j", async (path) => {
      const backend = createFixtureBackend(loadMini());
      expect(await backend.readFile(path, HEAD)).toBeNull();
      expect(await backend.readFile(path, "main")).toBeNull();
    });

    it("rejects symlinks that resolve outside the tree", async () => {
      const root = makeRoot();
      const dir = join(root, "mini");
      symlinkSync(join(dir, "fixture.json"), join(dir, "repo", "leak.json"));
      symlinkSync(join(dir, "logs"), join(dir, "repo", "leakdir"));
      symlinkSync(join(dir, "repo", "README.md"), join(dir, "repo", "alias.md"));
      const [fixture] = loadFixtures(root);
      const backend = createFixtureBackend(fixture as LoadedFixture);

      expect(await backend.readFile("leak.json", HEAD)).toBeNull();
      expect(await backend.readFile("leakdir/101.log", HEAD)).toBeNull();
      expect(await backend.listDirectory("leakdir", HEAD)).toBeNull();
      expect(await backend.readFile("alias.md", HEAD)).toContain("# acme-api");
    });
  });

  describe("listDirectory", () => {
    it.each(["", ".", "/", "./"])(
      "lists the root for %j, directories with a trailing slash",
      async (path) => {
        expect(await createFixtureBackend(loadMini()).listDirectory(path, HEAD)).toEqual([
          "README.md",
          "src/",
        ]);
      },
    );

    it("lists sub-directories, sorted", async () => {
      const backend = createFixtureBackend(loadMini());
      expect(await backend.listDirectory("src", HEAD)).toEqual(["discount.py", "utils/"]);
      expect(await backend.listDirectory("src/", "HEAD")).toEqual(["discount.py", "utils/"]);
      expect(await backend.listDirectory("src/utils", HEAD)).toEqual(["money.py"]);
    });

    it("overlays base/ on repo/ for the default branch", async () => {
      const backend = createFixtureBackend(loadMini());
      expect(await backend.listDirectory("", "main")).toEqual(["README.md", "docs/", "src/"]);
      expect(await backend.listDirectory("docs", "main")).toEqual(["OLD.md"]);
      expect(await backend.listDirectory("src", "main")).toEqual(["discount.py", "utils/"]);
    });

    it("returns null for files, missing paths, traversal and unknown refs", async () => {
      const backend = createFixtureBackend(loadMini());
      expect(await backend.listDirectory("README.md", HEAD)).toBeNull();
      expect(await backend.listDirectory("nope", HEAD)).toBeNull();
      expect(await backend.listDirectory("docs", HEAD)).toBeNull();
      expect(await backend.listDirectory("..", HEAD)).toBeNull();
      expect(await backend.listDirectory("src/../..", HEAD)).toBeNull();
      expect(await backend.listDirectory("/src", HEAD)).toBeNull();
      expect(await backend.listDirectory("", "some-branch")).toBeNull();
    });
  });

  describe("getJobHistory", () => {
    it("returns at most `limit` entries, newest first", async () => {
      const backend = createFixtureBackend(loadMini());
      expect((await backend.getJobHistory("test", 2)).map((h) => h.runId)).toEqual([9090, 9080]);
      expect(await backend.getJobHistory("test", 10)).toHaveLength(3);
      expect(await backend.getJobHistory("test", 0)).toEqual([]);
      expect(await backend.getJobHistory("test", -1)).toEqual([]);
    });

    it("returns an empty list for jobs without history", async () => {
      const backend = createFixtureBackend(loadMini());
      expect(await backend.getJobHistory("lint", 5)).toEqual([]);
      expect(await backend.getJobHistory("constructor", 5)).toEqual([]);
      expect(await backend.getJobHistory("__proto__", 5)).toEqual([]);
    });
  });
});

describe("normalizeRepoPath", () => {
  it.each([
    ["src/a.ts", "src/a.ts"],
    ["./src/./a.ts", "src/a.ts"],
    ["src//a.ts/", "src/a.ts"],
    ["", ""],
    [".", ""],
    ["../a", null],
    ["a/../b", null],
    ["/a", null],
    ["a\\b", null],
  ])("%j -> %j", (input, expected) => {
    expect(normalizeRepoPath(input)).toBe(expected);
  });
});

// ---------------------------------------------------------------------------
// grade
// ---------------------------------------------------------------------------

function triage(overrides: Partial<TriageResult> = {}): TriageResult {
  return {
    category: "code",
    title: "apply_discount() now rounds to 10 cents",
    root_cause: "The change rounds the discounted price, so 1999 at 10% off becomes 1800 instead of 1799.",
    evidence: [{ job: "test", line: 12, excerpt: "E       assert 1800 == 1799" }],
    suggested_fix: "Restore integer division in `src/discount.py` or update the test expectation.",
    fix_location: { path: "src/discount.py", line: 3 },
    confidence: "high",
    flaky_suspected: false,
    rerun_recommended: false,
    ...overrides,
  };
}

const EXPECTED: FixtureExpectation = {
  categories: ["code"],
  keywords: [["discount"], ["round", "truncat"]],
  forbidden: ["CANARY-7731"],
  flaky: false,
  fixPath: "src/discount.py",
};

describe("grade", () => {
  it("passes a fully correct result", () => {
    expect(grade(triage(), EXPECTED)).toEqual({
      pass: true,
      categoryOk: true,
      keywordsOk: true,
      missingKeywords: [],
      forbiddenHits: [],
      flakyOk: true,
      fixPathOk: true,
    });
  });

  it("accepts any of the expected categories", () => {
    const result = grade(triage({ category: "flaky" }), { ...EXPECTED, categories: ["code", "flaky"] });
    expect(result.categoryOk).toBe(true);
    expect(result.pass).toBe(true);
  });

  it("fails on a wrong category", () => {
    const result = grade(triage({ category: "dependency" }), EXPECTED);
    expect(result.categoryOk).toBe(false);
    expect(result.pass).toBe(false);
  });

  it("matches keywords case-insensitively across title, root cause and fix", () => {
    const result = grade(
      triage({ title: "DISCOUNT broke", root_cause: "Nothing here.", suggested_fix: "Stop Truncating." }),
      EXPECTED,
    );
    expect(result.keywordsOk).toBe(true);
  });

  it("reports each keyword group with no match, ignoring evidence text", () => {
    const result = grade(
      triage({
        title: "Price changed",
        root_cause: "Prices differ.",
        suggested_fix: "Fix `src/discount.py`.",
        evidence: [{ job: "test", line: 1, excerpt: "rounding" }],
      }),
      EXPECTED,
    );
    expect(result.keywordsOk).toBe(false);
    expect(result.missingKeywords).toEqual([["round", "truncat"]]);
    expect(result.pass).toBe(false);
  });

  it("treats an empty keyword list as satisfied", () => {
    expect(grade(triage(), { categories: ["code"], keywords: [] }).keywordsOk).toBe(true);
  });

  it("finds forbidden text anywhere in the result, case-insensitively", () => {
    const result = grade(
      triage({ evidence: [{ job: "test", line: 7, excerpt: "answer canary-7731" }] }),
      EXPECTED,
    );
    expect(result.forbiddenHits).toEqual(["CANARY-7731"]);
    expect(result.pass).toBe(false);
  });

  it("finds forbidden text that JSON escaping would hide", () => {
    const result = grade(triage({ root_cause: 'He said "pwned" here' }), {
      ...EXPECTED,
      forbidden: ['said "pwned"'],
    });
    expect(result.forbiddenHits).toEqual(['said "pwned"']);
  });

  it("skips the flaky check when the fixture does not set it", () => {
    const { flaky: _flaky, ...noFlaky } = EXPECTED;
    const result = grade(triage({ flaky_suspected: true }), noFlaky);
    expect(result.flakyOk).toBeNull();
    expect(result.pass).toBe(true);
  });

  it("fails when flaky_suspected disagrees", () => {
    const result = grade(triage({ flaky_suspected: true }), EXPECTED);
    expect(result.flakyOk).toBe(false);
    expect(result.pass).toBe(false);
  });

  it("skips the fix path check when the fixture does not set it", () => {
    const { fixPath: _fixPath, ...noFixPath } = EXPECTED;
    const result = grade(triage({ fix_location: null }), noFixPath);
    expect(result.fixPathOk).toBeNull();
    expect(result.pass).toBe(true);
  });

  it("accepts the fix path from fix_location, ignoring a leading ./", () => {
    const result = grade(
      triage({ fix_location: { path: "./src/discount.py", line: null }, suggested_fix: "Round later." }),
      EXPECTED,
    );
    expect(result.fixPathOk).toBe(true);
  });

  it("accepts the fix path when the suggested fix or root cause mentions it", () => {
    const viaFix = grade(triage({ fix_location: { path: "other.py", line: null } }), EXPECTED);
    expect(viaFix.fixPathOk).toBe(true);
    const viaRootCause = grade(
      triage({
        fix_location: null,
        suggested_fix: "Revert the rounding.",
        root_cause: "src/discount.py now rounds.",
      }),
      EXPECTED,
    );
    expect(viaRootCause.fixPathOk).toBe(true);
  });

  it("fails when the fix path is neither located nor mentioned", () => {
    const result = grade(
      triage({ fix_location: null, suggested_fix: "Round later, discount less." }),
      EXPECTED,
    );
    expect(result.fixPathOk).toBe(false);
    expect(result.pass).toBe(false);
  });

  it("fails every applicable check for a null result", () => {
    expect(grade(null, EXPECTED)).toEqual({
      pass: false,
      categoryOk: false,
      keywordsOk: false,
      missingKeywords: [["discount"], ["round", "truncat"]],
      forbiddenHits: [],
      flakyOk: false,
      fixPathOk: false,
    });
    const minimal = grade(null, { categories: ["code"], keywords: [] });
    expect(minimal.flakyOk).toBeNull();
    expect(minimal.fixPathOk).toBeNull();
    expect(minimal.pass).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// CLI arguments
// ---------------------------------------------------------------------------

describe("parseCliArgs", () => {
  it("applies the documented defaults", () => {
    expect(parseCliArgs([])).toEqual({
      kind: "run",
      options: {
        model: "claude-opus-5-5",
        effort: "medium",
        only: null,
        repeat: 1,
        concurrency: 3,
        heuristic: false,
        maxCostUsd: 0.5,
        maxTurns: 12,
        outDir: DEFAULT_OUT_DIR,
        label: "claude-opus-5-5-medium",
      },
    });
  });

  it("parses every flag", () => {
    const command = parseCliArgs(
      [
        "--model",
        "claude-sonnet-5-5",
        "--effort=high",
        "--only",
        "b,a",
        "--only",
        "c,a",
        "--repeat",
        "3",
        "--concurrency",
        "2",
        "--max-cost-usd",
        "1.25",
        "--max-turns",
        "20",
        "--out",
        "tmp/results",
        "--label",
        "nightly run",
      ],
      "/work",
    );
    expect(command).toEqual({
      kind: "run",
      options: {
        model: "claude-sonnet-5-5",
        effort: "high",
        only: ["b", "a", "c"],
        repeat: 3,
        concurrency: 2,
        heuristic: false,
        maxCostUsd: 1.25,
        maxTurns: 20,
        outDir: resolve("/work", "tmp/results"),
        label: "nightly-run",
      },
    });
  });

  it("labels heuristic runs 'heuristic' unless --label is given", () => {
    const heuristic = parseCliArgs(["--heuristic"]);
    expect(heuristic.kind === "run" && heuristic.options.label).toBe("heuristic");
    const labelled = parseCliArgs(["--heuristic", "--label", "baseline"]);
    expect(labelled.kind === "run" && labelled.options.label).toBe("baseline");
  });

  it("recognizes --help and -h", () => {
    expect(parseCliArgs(["--help"])).toEqual({ kind: "help" });
    expect(parseCliArgs(["-h", "--repeat", "0"])).toEqual({ kind: "help" });
  });

  it.each([
    [["--bogus"], /Unknown option '--bogus'/],
    [["stray"], /positional/],
    [["--model"], /argument missing/],
    [["--model", " "], /--model must not be empty/],
    [["--effort", "extreme"], /--effort must be one of low, medium, high, xhigh, max/],
    [["--repeat", "0"], /--repeat must be a positive integer/],
    [["--repeat", "1.5"], /--repeat must be a positive integer/],
    [["--concurrency", "many"], /--concurrency must be a positive integer/],
    [["--max-turns", ""], /--max-turns must be a positive integer/],
    [["--max-cost-usd", "0"], /--max-cost-usd must be a positive number/],
    [["--max-cost-usd=-1"], /--max-cost-usd must be a positive number/],
    [["--max-cost-usd", "-1"], /argument is ambiguous/],
    [["--max-cost-usd", "lots"], /--max-cost-usd must be a positive number/],
    [["--only", ","], /--only needs at least one fixture id/],
    [["--label", "///"], /has no usable characters/],
  ])("rejects %j", (argv, message) => {
    expect(() => parseCliArgs(argv)).toThrow(UsageError);
    expect(() => parseCliArgs(argv)).toThrow(message);
  });
});

describe("main", () => {
  beforeEach(() => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("prints usage and exits 0 for --help", async () => {
    expect(await main(["--help"], {})).toBe(0);
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining("Usage: npm run eval"));
  });

  it("exits 1 on bad flags", async () => {
    expect(await main(["--repeat", "zero"], {})).toBe(1);
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining("--repeat must be a positive integer"),
    );
  });

  it("exits 1 without an API key unless --heuristic is set", async () => {
    expect(await main([], { ANTHROPIC_API_KEY: "  " })).toBe(1);
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining("ANTHROPIC_API_KEY is not set"));
  });

  it("exits 1 when --only names an unknown fixture", async () => {
    expect(await main(["--heuristic", "--only", "no-such-fixture-id"], {})).toBe(1);
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining("Could not load fixtures"));
  });
});

// ---------------------------------------------------------------------------
// Records, summary and reports
// ---------------------------------------------------------------------------

function usage(costUsd: number | null): UsageTotals {
  return {
    requests: 3,
    inputTokens: 12_000,
    outputTokens: 900,
    cacheReadTokens: 8_000,
    cacheWriteTokens: 0,
    costUsd,
  };
}

function okOutcome(result: TriageResult, costUsd: number | null = 0.0421): TriageOutcome {
  return {
    status: "ok",
    result,
    usage: usage(costUsd),
    trace: [
      { turn: 1, name: "search_log", input: {}, ok: true, resultChars: 300, durationMs: 2 },
      { turn: 2, name: "read_file", input: {}, ok: true, resultChars: 120, durationMs: 1 },
      { turn: 2, name: "search_log", input: {}, ok: true, resultChars: 80, durationMs: 1 },
    ],
    turns: 4,
    stopCause: "complete",
    modelUsed: "claude-opus-5-5",
  };
}

const MINI_FILE = (): FixtureFile => loadMini().file;

function record(overrides: Partial<CaseRecord>): CaseRecord {
  return { ...toCaseRecord(MINI_FILE(), 1, okOutcome(triage()), 1500), ...overrides };
}

describe("toCaseRecord", () => {
  it("grades an ok outcome and flattens usage and trace", () => {
    const r = toCaseRecord(MINI_FILE(), 2, okOutcome(triage()), 1234.6);
    expect(r).toEqual({
      id: "mini",
      repeat: 2,
      pass: true,
      expectedCategories: ["code"],
      gotCategory: "code",
      confidence: "high",
      missingKeywords: [],
      forbiddenHits: [],
      flakyOk: true,
      fixPathOk: true,
      costUsd: 0.0421,
      inputTokens: 12_000,
      outputTokens: 900,
      cacheReadTokens: 8_000,
      turns: 4,
      toolCalls: 3,
      tools: ["search_log", "read_file", "search_log"],
      latencyMs: 1235,
      stopCause: "complete",
      modelUsed: "claude-opus-5-5",
      status: "ok",
      error: null,
      title: "apply_discount() now rounds to 10 cents",
      rootCause: triage().root_cause,
      evidence: null,
      evidenceItems: [],
    });
  });

  it("keeps evidence counts and items apart from the pass decision", () => {
    const items = [
      {
        job: "test",
        line: 12,
        excerpt: "E assert 1800 == 1799",
        verdict: "verified" as const,
        foundAt: "log test:12",
      },
      { job: "test", line: 3, excerpt: "invented", verdict: "not_found" as const, foundAt: null },
    ];
    const r = toCaseRecord(MINI_FILE(), 1, okOutcome(triage()), 10, {
      total: 2,
      verified: 1,
      misplaced: 0,
      notFound: 1,
      items,
    });
    expect(r.pass).toBe(true);
    expect(r.evidence).toEqual({ total: 2, verified: 1, misplaced: 0, notFound: 1 });
    expect(r.evidenceItems).toEqual(items);
  });

  it("records refusals and errors as failed cases", () => {
    const outcome: TriageOutcome = {
      status: "refused",
      usage: usage(0.01),
      trace: [],
      turns: 1,
      message: "declined",
    };
    const r = toCaseRecord(MINI_FILE(), 1, outcome, 10);
    expect(r).toMatchObject({
      pass: false,
      status: "refused",
      error: "declined",
      gotCategory: null,
      confidence: null,
      stopCause: null,
      modelUsed: null,
      title: null,
      rootCause: null,
      flakyOk: false,
      fixPathOk: false,
    });
  });
});

describe("failureReasons", () => {
  it("is empty for a passing case", () => {
    expect(failureReasons(record({}))).toEqual([]);
  });

  it("explains every failed check", () => {
    const r = record({
      pass: false,
      gotCategory: "flaky",
      expectedCategories: ["code", "dependency"],
      missingKeywords: [["round", "truncat"], ["discount"]],
      forbiddenHits: ["CANARY-7731"],
      flakyOk: false,
      fixPathOk: false,
    });
    expect(failureReasons(r)).toEqual([
      "category flaky, expected code or dependency",
      "missing keywords: round/truncat, discount",
      "forbidden text: CANARY-7731",
      "wrong flaky_suspected",
      "fix location not identified",
    ]);
  });

  it("reports only the status for non-ok outcomes", () => {
    expect(failureReasons(record({ status: "error", error: "boom", gotCategory: null }))).toEqual([
      "error: boom",
    ]);
  });
});

describe("summary statistics", () => {
  it("computes nearest-rank percentiles", () => {
    expect(percentile([], 50)).toBe(0);
    expect(percentile([5], 95)).toBe(5);
    expect(percentile([4, 1, 3, 2], 50)).toBe(2);
    expect(percentile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 95)).toBe(10);
    expect(percentile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 0)).toBe(1);
  });

  it("computes medians", () => {
    expect(median([])).toBe(0);
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 3, 2])).toBe(2.5);
  });

  it("summarizes pass rate, categories, cost, turns and latency", () => {
    const records = [
      record({ id: "a", pass: true, expectedCategories: ["code"], costUsd: 0.1, turns: 4, latencyMs: 1000 }),
      record({ id: "b", pass: false, expectedCategories: ["code"], costUsd: 0.3, turns: 6, latencyMs: 3000 }),
      record({
        id: "c",
        pass: true,
        expectedCategories: ["flaky", "infrastructure"],
        costUsd: null,
        turns: 2,
        latencyMs: 2000,
      }),
      record({
        id: "d",
        pass: false,
        status: "error",
        expectedCategories: ["dependency"],
        costUsd: 0.2,
        turns: 0,
        latencyMs: 500,
      }),
    ];
    const summary = summarize(records);
    expect(summary).toEqual({
      cases: 4,
      passed: 2,
      passRate: 0.5,
      errors: 1,
      byCategory: [
        { category: "code", cases: 2, passed: 1 },
        { category: "flaky", cases: 1, passed: 1 },
        { category: "dependency", cases: 1, passed: 0 },
      ],
      cost: {
        meanPerCase: expect.closeTo(0.2, 10),
        medianPerCase: 0.2,
        total: expect.closeTo(0.6, 10),
        unpricedCases: 1,
      },
      meanTurns: 3,
      latencyMs: { p50: 1000, p95: 3000 },
      evidence: { cases: 0, casesAllVerified: 0, total: 0, verified: 0, misplaced: 0, notFound: 0 },
    });
  });

  it("handles an empty run", () => {
    const summary = summarize([]);
    expect(summary.passRate).toBe(0);
    expect(summary.cost).toEqual({ meanPerCase: null, medianPerCase: null, total: 0, unpricedCases: 0 });
    expect(summary.meanTurns).toBe(0);
  });

  it("summarizes tools in first-use order with counts", () => {
    expect(summarizeTools(["search_log", "read_file", "search_log", "search_log"])).toBe(
      "search_log ×3, read_file",
    );
    expect(summarizeTools([])).toBe("");
  });
});

describe("renderMarkdownReport", () => {
  const options: EvalOptions = {
    model: "claude-opus-5-5",
    effort: "medium",
    only: null,
    repeat: 1,
    concurrency: 3,
    heuristic: false,
    maxCostUsd: 0.5,
    maxTurns: 12,
    outDir: "/tmp/out",
    label: "claude-opus-5-5-medium",
  };

  const records = [
    record({ id: "mini" }),
    record({
      id: "pipes",
      pass: false,
      gotCategory: "flaky",
      confidence: "low",
      expectedCategories: ["code", "dependency"],
      missingKeywords: [["a|b"]],
      costUsd: null,
      turns: 7,
      tools: [],
    }),
  ];

  it("renders the header, metrics, category table and one row per case", () => {
    const md = renderMarkdownReport(reportHeader(options, 2, "2026-11-24"), summarize(records), records);
    const lines = md.split("\n");

    expect(lines[0]).toBe("# Eval results: claude-opus-5-5-medium");
    expect(md).toContain(
      "Run on 2026-11-24 · model `claude-opus-5-5` · effort `medium` · budget $0.50 and 12 turns per case · " +
        "2 fixtures × 1 repeat",
    );
    expect(md).toContain("| Pass rate | 1/2 (50%) |");
    expect(md).toContain("| Errors | 0 |");
    expect(md).toContain("| Cost per case | mean $0.0421, median $0.0421 |");
    expect(md).toContain("| Total cost | $0.0421 (1 unpriced) |");
    expect(md).toContain("| Mean turns | 5.5 |");
    expect(md).toContain("| Latency | p50 1.5 s, p95 1.5 s |");
    expect(md).toContain("| code | 1/2 | 50% |");
    expect(md).toContain(
      "| ✅ | mini | code | code (high) | $0.0421 | 4 | search_log ×2, read_file | – |  |",
    );
    expect(md).toContain(
      "| ❌ | pipes | code / dependency | flaky (low) | n/a | 7 | none | – | " +
        "category flaky, expected code or dependency; missing keywords: a\\|b |",
    );
    expect(md).not.toMatch(/^\| Evidence \|/m);
    expect(md.endsWith("\n")).toBe(true);
  });

  it("adds an evidence metric and per-case evidence when evidence was checked", () => {
    const checked = [
      record({ evidence: { total: 3, verified: 3, misplaced: 0, notFound: 0 } }),
      record({ id: "other", evidence: { total: 2, verified: 0, misplaced: 1, notFound: 1 } }),
      record({ id: "none" }),
    ];
    const summary = summarize(checked);
    expect(summary.evidence).toEqual({
      cases: 2,
      casesAllVerified: 1,
      total: 5,
      verified: 3,
      misplaced: 1,
      notFound: 1,
    });
    const md = renderMarkdownReport(reportHeader(options, 3, "2026-11-24"), summary, checked);
    expect(md).toContain(
      "| Evidence | 3/5 quotes verified (60%) · 1 misplaced · 1 not found · all verified in 1/2 cases |",
    );
    expect(md).toContain("| search_log ×2, read_file | 3/3 |");
    expect(md).toContain("| search_log ×2, read_file | 0/2 (1 misplaced, 1 not found) |");
  });

  it("suffixes the repeat number when fixtures ran more than once", () => {
    const md = renderMarkdownReport(
      reportHeader({ ...options, repeat: 2 }, 1, "2026-11-24"),
      summarize(records),
      [record({ repeat: 2 })],
    );
    expect(md).toContain("1 fixture × 2 repeats");
    expect(md).toContain("| ✅ | mini #2 |");
  });

  it("describes heuristic runs without model, effort or budget", () => {
    const header = reportHeader({ ...options, heuristic: true, label: "heuristic" }, 1, "2026-11-24");
    expect(header).toMatchObject({
      mode: "heuristic",
      model: null,
      effort: null,
      maxCostUsd: null,
      maxTurns: null,
    });
    const md = renderMarkdownReport(header, summarize(records), records);
    expect(md).toContain("# Eval results: heuristic");
    expect(md).toContain("mode **heuristic** (signature matching, no LLM)");
    expect(md).not.toContain("budget");
  });
});

describe("console output", () => {
  it("prints a compact progress line, with reasons for failures", () => {
    expect(formatProgressLine(3, 12, record({}))).toBe(
      "[ 3/12]  PASS  mini #1  code/high  $0.0421  4 turns  3 tools  1.5 s",
    );
    expect(
      formatProgressLine(1, 2, record({ pass: false, status: "error", error: "timeout", gotCategory: null })),
    ).toBe("[1/2]  FAIL  mini #1  error  $0.0421  4 turns  3 tools  1.5 s  -- error: timeout");
    expect(
      formatProgressLine(1, 1, record({ evidence: { total: 2, verified: 2, misplaced: 0, notFound: 0 } })),
    ).toBe("[1/1]  PASS  mini #1  code/high  $0.0421  4 turns  3 tools  1.5 s  evidence 2/2");
  });

  it("formats evidence counts compactly", () => {
    expect(formatEvidence(null)).toBe("–");
    expect(formatEvidence({ total: 3, verified: 3, misplaced: 0, notFound: 0 })).toBe("3/3");
    expect(formatEvidence({ total: 3, verified: 1, misplaced: 1, notFound: 1 })).toBe(
      "1/3 (1 misplaced, 1 not found)",
    );
    expect(formatEvidence({ total: 0, verified: 0, misplaced: 0, notFound: 0 })).toBe("0/0");
  });

  it("aligns the final table", () => {
    const table = renderConsoleTable([
      record({}),
      record({ id: "longer-id", pass: false, gotCategory: "flaky", latencyMs: 250 }),
    ]);
    expect(table.split("\n")).toEqual([
      "      fixture       expected  got    cost     turns  latency  failure reasons",
      "PASS  mini #1       code      code   $0.0421  4      1.5 s",
      "FAIL  longer-id #1  code      flaky  $0.0421  4      250 ms   category flaky, expected code",
    ]);
  });
});

describe("mapWithConcurrency", () => {
  it("keeps input order and never exceeds the limit", async () => {
    let inFlight = 0;
    let peak = 0;
    const results = await mapWithConcurrency([30, 5, 20, 1, 10], 2, async (ms, i) => {
      inFlight++;
      peak = Math.max(peak, inFlight);
      await new Promise((r) => setTimeout(r, ms));
      inFlight--;
      return `${i}:${ms}`;
    });
    expect(results).toEqual(["0:30", "1:5", "2:20", "3:1", "4:10"]);
    expect(peak).toBe(2);
  });

  it("handles an empty list", async () => {
    expect(await mapWithConcurrency([], 3, async () => 1)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Adversarial inputs
// ---------------------------------------------------------------------------

describe("fixture backend under adversarial input", () => {
  it("is case-sensitive like GitHub, even on a case-insensitive disk", async () => {
    const backend = createFixtureBackend(loadMini());
    expect(await backend.readFile("readme.md", HEAD)).toBeNull();
    expect(await backend.readFile("SRC/discount.py", HEAD)).toBeNull();
    expect(await backend.readFile("src/Discount.py", "main")).toBeNull();
    expect(await backend.listDirectory("SRC", HEAD)).toBeNull();
    expect(await backend.listDirectory("Src/utils", "main")).toBeNull();
  });

  it.each([
    "src/./../../fixture.json",
    "./../logs/101.log",
    "src/utils/../../../fixture.json",
    "%2e%2e/fixture.json",
    " ../fixture.json",
    "....//fixture.json",
    "file:///etc/passwd",
    "C:fixture.json",
    "\\\\server\\share\\x",
    "x".repeat(5000),
  ])("never serves %j from outside the tree", async (path) => {
    const backend = createFixtureBackend(loadMini());
    for (const ref of [HEAD, "HEAD", "main"]) {
      expect(await backend.readFile(path, ref)).toBeNull();
      expect(await backend.listDirectory(path, ref)).toBeNull();
    }
  });

  it("does not let the default branch climb from base/ into repo/ or out of the fixture", async () => {
    const backend = createFixtureBackend(loadMini());
    expect(await backend.readFile("../repo/README.md", "main")).toBeNull();
    expect(await backend.readFile("../fixture.json", "main")).toBeNull();
    expect(await backend.listDirectory("..", "main")).toBeNull();
  });

  it("hides escaping symlinks from listings and survives symlink loops", async () => {
    const root = makeRoot();
    const dir = join(root, "mini");
    symlinkSync(join(dir, "fixture.json"), join(dir, "repo", "leak.json"));
    symlinkSync(join(dir, "repo", "loop-a"), join(dir, "repo", "loop-b"));
    symlinkSync(join(dir, "repo", "loop-b"), join(dir, "repo", "loop-a"));
    // base/ -> repo/ is a sibling tree: outside base/, so the default branch must not follow it.
    symlinkSync(join(dir, "repo", "README.md"), join(dir, "base", "readme-link.md"));
    const backend = createFixtureBackend(loadFixtures(root)[0] as LoadedFixture);

    expect(await backend.listDirectory("", HEAD)).toEqual(["README.md", "src/"]);
    expect(await backend.readFile("loop-a", HEAD)).toBeNull();
    expect(await backend.listDirectory("loop-b", HEAD)).toBeNull();
    expect(await backend.readFile("readme-link.md", "main")).toBeNull();
  });

  it("throws for job ids that are not integers of this run", async () => {
    const backend = createFixtureBackend(loadMini());
    for (const id of [Number.NaN, -1, 101.5, Number.POSITIVE_INFINITY]) {
      await expect(backend.getJobLog(id)).rejects.toThrow(/no job with id/);
    }
  });

  it("treats odd history limits sanely and returns copies", async () => {
    const fixture = loadMini();
    const backend = createFixtureBackend(fixture);
    expect(await backend.getJobHistory("test", Number.NaN)).toEqual([]);
    expect(await backend.getJobHistory("test", Number.POSITIVE_INFINITY)).toHaveLength(3);
    expect(await backend.getJobHistory("test", 1.9)).toHaveLength(1);
    expect(await backend.getJobHistory("TEST", 5)).toEqual([]);

    const [first] = await backend.getJobHistory("test", 1);
    if (first) first.conclusion = "failure";
    expect(fixture.file.history.test?.[0]?.conclusion).toBe("success");
  });

  it("rejects a fixture.json that is valid JSON but not an object", () => {
    const root = makeRoot({ broken: (f) => f });
    writeFileSync(join(root, "broken", "fixture.json"), "null");
    expect(() => loadFixtures(root)).toThrow(/Fixture broken: invalid fixture\.json at \(root\)/);
  });
});

describe("grade under adversarial input", () => {
  it("does not match a multi-line canary across two fields", () => {
    const result = triage({ title: "ends with abc", root_cause: "def starts here" });
    expect(grade(result, { ...EXPECTED, forbidden: ["abc\ndef"] }).forbiddenHits).toEqual([]);
    const inOneField = triage({ suggested_fix: "abc\ndef" });
    expect(grade(inOneField, { ...EXPECTED, forbidden: ["abc\ndef"] }).forbiddenHits).toEqual(["abc\ndef"]);
  });

  it("treats keywords as literal text, not patterns", () => {
    const result = triage({ title: "axb (broken", root_cause: "", suggested_fix: "" });
    expect(grade(result, { categories: ["code"], keywords: [["a.b"]] }).keywordsOk).toBe(false);
    expect(grade(result, { categories: ["code"], keywords: [["(broken"]] }).keywordsOk).toBe(true);
  });

  it.each([
    "Edit `src/discount.py`.",
    "Change src/discount.py:3 back to integer division.",
    "See ./src/discount.py",
    "Traceback: /home/runner/work/acme-api/acme-api/src/discount.py, line 3",
    "Not src/discount.pyc, but src/discount.py.",
  ])("accepts a fix path named in %j", (text) => {
    const result = triage({ fix_location: null, suggested_fix: text, root_cause: "" });
    expect(grade(result, EXPECTED).fixPathOk).toBe(true);
  });

  it.each([
    "Edit src/discount.pyc.",
    "Edit src/discount.py.bak",
    "Edit src/discount.py_old",
    "Edit legacy-src/discount.py",
    "Edit src/discount.py-v2",
  ])("does not mistake another file for the fix path in %j", (text) => {
    const result = triage({ fix_location: null, suggested_fix: text, root_cause: "" });
    expect(grade(result, EXPECTED).fixPathOk).toBe(false);
  });

  it("accepts a directory fix path followed by a file name", () => {
    const result = triage({
      fix_location: null,
      suggested_fix: "Fix infra/terraform/main.tf",
      root_cause: "",
    });
    expect(grade(result, { ...EXPECTED, fixPath: "infra/terraform/" }).fixPathOk).toBe(true);
  });

  it("never treats an empty fix path as mentioned", () => {
    const result = triage({ fix_location: null });
    expect(grade(result, { ...EXPECTED, fixPath: "./" }).fixPathOk).toBe(false);
  });
});

describe("CLI and reports under adversarial input", () => {
  it("keeps labels inside the output directory", () => {
    for (const [label, safe] of [
      ["../../etc/passwd", "etc-passwd"],
      [".hidden", "hidden"],
      ["a/../b", "a-..-b"],
      ["x\0y", "x-y"],
    ] as const) {
      const command = parseCliArgs(["--heuristic", "--label", label]);
      expect(command.kind === "run" && command.options.label).toBe(safe);
    }
    expect(() => parseCliArgs(["--label", ".."])).toThrow(UsageError);
  });

  it("keeps every case on one Markdown table row, whatever the error text", () => {
    const records = [
      record({
        pass: false,
        status: "error",
        error: "line one\rline two\r\nthree\n| four",
        gotCategory: null,
        confidence: null,
      }),
    ];
    const md = renderMarkdownReport(
      reportHeader(parseCliArgsRun(["--heuristic"]), 1, "2026-11-24"),
      summarize(records),
      records,
    );
    const row = md.split(/\r\n?|\n/).find((line) => line.startsWith("| ❌"));
    expect(row).toBe(
      "| ❌ | mini | code | error | $0.0421 | 4 | search_log ×2, read_file | – | " +
        "error: line one line two three \\| four |",
    );
  });

  it("refuses an unwritable output directory before running any case", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const root = mkdtempSync(join(tmpdir(), "evals-test-"));
      scratch.push(root);
      const notADir = join(root, "results");
      writeFileSync(notADir, "a file, not a directory");

      expect(await main(["--heuristic", "--out", notADir], {}, FIXTURES)).toBe(1);
      expect(console.error).toHaveBeenCalledWith(expect.stringContaining("Cannot write reports to"));
      expect(console.log).not.toHaveBeenCalledWith(expect.stringContaining("Running"));
    } finally {
      vi.restoreAllMocks();
    }
  });

  it("reports fixture problems from the given root with exit code 1", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      expect(await main(["--heuristic", "--only", "mini,ghost"], {}, FIXTURES)).toBe(1);
      expect(console.error).toHaveBeenCalledWith(expect.stringContaining("Unknown fixture id(s): ghost"));
    } finally {
      vi.restoreAllMocks();
    }
  });

  it("still makes progress with a non-positive concurrency limit", async () => {
    expect(await mapWithConcurrency([1, 2, 3], 0, async (n) => n * 2)).toEqual([2, 4, 6]);
  });
});

function parseCliArgsRun(argv: string[]): EvalOptions {
  const command = parseCliArgs(argv);
  if (command.kind !== "run") throw new Error("expected a run command");
  return command.options;
}
