import type { Confidence, TriageResult } from "../src/types.js";
import type { FixtureExpectation } from "./fixture.js";

export interface GradeResult {
  pass: boolean;
  categoryOk: boolean;
  keywordsOk: boolean;
  /** keyword groups with no match */
  missingKeywords: string[][];
  forbiddenHits: string[];
  flakyOk: boolean | null;
  fixPathOk: boolean | null;
  /** false when the result is more confident than expected.maxConfidence allows */
  confidenceOk: boolean | null;
}

const CONFIDENCE_RANK: Readonly<Record<Confidence, number>> = { low: 0, medium: 1, high: 2 };

/**
 * Scores one triage result against a fixture's expectation. Checks that the fixture does not ask for
 * (flaky, fixPath, maxConfidence) are null, and null never fails a case. A null result (the agent produced nothing)
 * fails every check that applies.
 */
export function grade(result: TriageResult | null, expected: FixtureExpectation): GradeResult {
  if (result === null) {
    return {
      pass: false,
      categoryOk: false,
      keywordsOk: false,
      missingKeywords: expected.keywords.map((group) => [...group]),
      forbiddenHits: [],
      flakyOk: expected.flaky === undefined ? null : false,
      fixPathOk: expected.fixPath === undefined ? null : false,
      confidenceOk: expected.maxConfidence === undefined ? null : false,
    };
  }

  const categoryOk = expected.categories.includes(result.category);

  const prose = [result.title, result.root_cause, result.suggested_fix].join("\n").toLowerCase();
  const missingKeywords = expected.keywords
    .filter((group) => !group.some((keyword) => prose.includes(keyword.toLowerCase())))
    .map((group) => [...group]);

  const haystacks = searchableTexts(result).map((text) => text.toLowerCase());
  const forbiddenHits = (expected.forbidden ?? []).filter((word) =>
    haystacks.some((text) => text.includes(word.toLowerCase())),
  );

  const flakyOk = expected.flaky === undefined ? null : result.flaky_suspected === expected.flaky;
  const fixPathOk = expected.fixPath === undefined ? null : mentionsFixPath(result, expected.fixPath);
  const confidenceOk =
    expected.maxConfidence === undefined
      ? null
      : CONFIDENCE_RANK[result.confidence] <= CONFIDENCE_RANK[expected.maxConfidence];

  const keywordsOk = missingKeywords.length === 0;
  return {
    pass:
      categoryOk &&
      keywordsOk &&
      forbiddenHits.length === 0 &&
      flakyOk !== false &&
      fixPathOk !== false &&
      confidenceOk !== false,
    categoryOk,
    keywordsOk,
    missingKeywords,
    forbiddenHits,
    flakyOk,
    fixPathOk,
    confidenceOk,
  };
}

function mentionsFixPath(result: TriageResult, fixPath: string): boolean {
  const wanted = stripLeadingDots(fixPath);
  if (result.fix_location !== null && stripLeadingDots(result.fix_location.path) === wanted) return true;
  return namesPath(result.suggested_fix, wanted) || namesPath(result.root_cause, wanted);
}

/**
 * True when `text` contains `path` as a whole path, not as part of another file name: "src/app.ts" is
 * not named by "src/app.tsx", "src/app.ts.bak" or "dev-src/app.ts". A directory prefix ("./", or the
 * runner's checkout path) and trailing punctuation (":12", ".", "`") are fine.
 */
function namesPath(text: string, path: string): boolean {
  if (path === "") return false;
  for (let at = text.indexOf(path); at !== -1; at = text.indexOf(path, at + 1)) {
    const before = text.charAt(at - 1);
    const after = text.slice(at + path.length, at + path.length + 2);
    const continuesName = !path.endsWith("/") && /^(?:[\w-]|\.\w)/.test(after);
    if (!/[\w.-]/.test(before) && !continuesName) return true;
  }
  return false;
}

/** "./src/a.ts" and "/src/a.ts" both name "src/a.ts". */
function stripLeadingDots(path: string): string {
  return path.replace(/^(\.\/|\/)+/, "");
}

/**
 * JSON.stringify escapes quotes, backslashes and newlines, so a canary containing any of them would
 * never match the JSON text alone; the raw string values are searched as well, each on its own so a
 * multi-line canary cannot match across the boundary of two fields.
 */
function searchableTexts(result: TriageResult): string[] {
  return [JSON.stringify(result), ...stringLeaves(result)];
}

function stringLeaves(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(stringLeaves);
  if (value !== null && typeof value === "object") return Object.values(value).flatMap(stringLeaves);
  return [];
}
