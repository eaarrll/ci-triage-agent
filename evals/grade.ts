import type { TriageResult } from "../src/types.js";
import type { FixtureExpectation } from "./fixture.js";

// CONTRACT STUB — implemented by the eval-harness owner.

export interface GradeResult {
  pass: boolean;
  categoryOk: boolean;
  keywordsOk: boolean;
  /** keyword groups with no match */
  missingKeywords: string[][];
  forbiddenHits: string[];
  flakyOk: boolean | null;
  fixPathOk: boolean | null;
}

export function grade(result: TriageResult | null, expected: FixtureExpectation): GradeResult {
  void result;
  void expected;
  throw new Error("not implemented");
}
