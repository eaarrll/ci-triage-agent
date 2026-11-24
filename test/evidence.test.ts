import { appendFileSync, cpSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import {
  checkEvidence,
  countVerdicts,
  findQuote,
  gradeEvidence,
  loadEvidenceSources,
  quoteLines,
} from "../evals/evidence.js";
import type { EvidenceSources } from "../evals/evidence.js";
import { createFixtureBackend, loadFixtures } from "../evals/fixture.js";
import { withRedaction } from "../src/redact.js";
import type { TriageEvidence, TriageResult } from "../src/types.js";

const FIXTURES = fileURLToPath(new URL("./fixtures/", import.meta.url));

let scratch: string[] = [];
afterEach(() => {
  for (const dir of scratch) rmSync(dir, { recursive: true, force: true });
  scratch = [];
});

/** Sources for the mini fixture (or a copy of it under `root`), read through the redacting backend. */
async function sources(root = FIXTURES): Promise<EvidenceSources> {
  const [fixture] = loadFixtures(root, ["mini"]);
  if (fixture === undefined) throw new Error("mini fixture missing");
  return loadEvidenceSources(withRedaction(createFixtureBackend(fixture)));
}

/** 1-based line number of the first log line of job "test" containing `text`. */
async function lineOf(src: EvidenceSources, text: string): Promise<number> {
  const job = src.jobs.find((j) => j.name === "test");
  const view = job === undefined ? null : await src.log(job);
  const hit = view?.all().find((line) => line.text.includes(text));
  if (hit === undefined) throw new Error(`no log line contains ${text}`);
  return hit.n;
}

const ev = (job: string, line: number | null, excerpt: string): TriageEvidence => ({ job, line, excerpt });

describe("quoteLines", () => {
  it("drops display prefixes, clip markers, blank lines and bare ellipses, and collapses whitespace", () => {
    expect(
      quoteLines(
        "  812 | E       assert 1800 == 1799\n\n> 813 | FAILED  tests/x.py [... 40 more chars]\n...",
      ),
    ).toEqual([["E assert 1800 == 1799"], ["FAILED tests/x.py"]]);
  });

  it("treats an ellipsis inside a line as an elision", () => {
    expect(quoteLines("FAILED tests/test_discount.py ... assert 1800 == 1799")).toEqual([
      ["FAILED tests/test_discount.py", "assert 1800 == 1799"],
    ]);
  });
});

describe("findQuote", () => {
  const texts = ["a", "first line", "", "noise", "second line", "x", "x", "x", "x", "x", "x", "third line"];

  it("matches quoted lines in order, allowing short gaps", () => {
    expect(findQuote(texts, [["first"], ["second"]])).toEqual([[1, 4]]);
  });

  it("rejects a quote whose next line is too far away", () => {
    expect(findQuote(texts, [["second"], ["third"]])).toEqual([]);
  });
});

describe("checkEvidence", () => {
  it("verifies a log quote at the cited line, whatever the whitespace or job-name case", async () => {
    const src = await sources();
    const n = await lineOf(src, "assert 1800 == 1799");
    for (const item of [
      ev("test", n, "E       assert 1800 == 1799"),
      ev("TEST", n, "E assert 1800 == 1799"),
      ev("101", n, `  ${n} | E       assert 1800 == 1799`),
    ]) {
      expect(await checkEvidence(item, src)).toMatchObject({ verdict: "verified", foundAt: `log test:${n}` });
    }
  });

  it("verifies a multi-line quote when the cited line is inside it", async () => {
    const src = await sources();
    const n = await lineOf(src, "assert 1800 == 1799");
    const quote =
      "def test_ten_percent_off():\n>       assert apply_discount(1999, 10) == 1799\nE       assert 1800 == 1799";
    expect((await checkEvidence(ev("test", n, quote), src)).verdict).toBe("verified");
  });

  it("accepts the 'name (id N)' heading the first message uses for each failed job", async () => {
    const src = await sources();
    const n = await lineOf(src, "assert 1800 == 1799");
    expect((await checkEvidence(ev("test (id 101)", n, "E       assert 1800 == 1799"), src)).verdict).toBe(
      "verified",
    );
  });

  it("verifies a file cited by path (or a unique path suffix) at that file's line", async () => {
    const src = await sources();
    const quote = "return int(round(price_cents * (100 - percent) / 100, -1))";
    for (const job of ["src/discount.py", "./src/discount.py", "discount.py"]) {
      expect(await checkEvidence(ev(job, 3, quote), src)).toMatchObject({
        verdict: "verified",
        foundAt: "file src/discount.py:3",
      });
    }
    expect((await checkEvidence(ev("src/discount.py", 1, quote), src)).verdict).toBe("misplaced");
    // A file line cited as a line of a job's log points the reader at the wrong place.
    expect((await checkEvidence(ev("test", 3, quote), src)).verdict).toBe("misplaced");
  });

  it("calls a real quote at the wrong line misplaced, and says where it is", async () => {
    const src = await sources();
    const n = await lineOf(src, "assert 1800 == 1799");
    expect(await checkEvidence(ev("test", n + 1, "E       assert 1800 == 1799"), src)).toMatchObject({
      verdict: "misplaced",
      foundAt: `log test:${n}`,
    });
  });

  it("finds quotes without a line in the diff or the repository, and misplaces them when a line is cited", async () => {
    const src = await sources();
    const diffLine = "return int(round(price_cents * (100 - percent) / 100, -1))";
    expect(await checkEvidence(ev("test", null, diffLine), src)).toMatchObject({
      verdict: "verified",
      foundAt: expect.stringMatching(/^diff src\/discount\.py:/) as unknown,
    });
    expect((await checkEvidence(ev("test", 3, diffLine), src)).verdict).toBe("misplaced");
  });

  it("does not find invented, empty or unknown-job quotes", async () => {
    const src = await sources();
    expect(await checkEvidence(ev("test", 12, "AssertionError: 1800 != 1799"), src)).toMatchObject({
      verdict: "not_found",
      foundAt: null,
    });
    expect((await checkEvidence(ev("test", 12, "  \n ... "), src)).verdict).toBe("not_found");
    expect((await checkEvidence(ev("no-such-job", 12, "nothing like this anywhere"), src)).verdict).toBe(
      "not_found",
    );
  });

  it("checks against the redacted log the agent saw, not the raw secret", async () => {
    const root = mkdtempSync(join(tmpdir(), "evidence-test-"));
    scratch.push(root);
    cpSync(join(FIXTURES, "mini"), join(root, "mini"), { recursive: true });
    const token = ["gh", "p_", "Fake0".repeat(8).slice(0, 36)].join("");
    appendFileSync(
      join(root, "mini", "logs", "101.log"),
      `2026-11-20T10:15:09.3500000Z export GH_TOKEN=${token}\n`,
    );

    const src = await sources(root);
    const n = await lineOf(src, "export GH_TOKEN=");
    expect((await checkEvidence(ev("test", n, "export GH_TOKEN=[REDACTED:github_token]"), src)).verdict).toBe(
      "verified",
    );
    expect((await checkEvidence(ev("test", n, `export GH_TOKEN=${token}`), src)).verdict).toBe("not_found");
  });
});

describe("gradeEvidence", () => {
  const result = (evidence: TriageEvidence[]): TriageResult => ({
    category: "code",
    title: "t",
    root_cause: "r",
    evidence,
    suggested_fix: "f",
    fix_location: null,
    confidence: "high",
    flaky_suspected: false,
    rerun_recommended: false,
  });

  it("counts verdicts per item, and returns null without a result", async () => {
    const src = await sources();
    const n = await lineOf(src, "assert 1800 == 1799");
    const graded = await gradeEvidence(
      result([
        ev("test", n, "E       assert 1800 == 1799"),
        ev("test", n + 1, "E       assert 1800 == 1799"),
        ev("test", n, "made up"),
      ]),
      src,
    );
    expect(graded).toMatchObject({ total: 3, verified: 1, misplaced: 1, notFound: 1 });
    expect(graded?.items.map((i) => i.verdict)).toEqual(["verified", "misplaced", "not_found"]);
    expect(countVerdicts([])).toEqual({ total: 0, verified: 0, misplaced: 0, notFound: 0 });
    expect(await gradeEvidence(null, src)).toBeNull();
  });
});
