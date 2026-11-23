import type { Category, LogView, SignatureHit, TriageContext, TriageResult } from "./types.js";

// CONTRACT STUB — implemented by the log-processing module owner.

export interface Signature {
  id: string;
  title: string;
  category: Category;
  hint: string;
  pattern: RegExp;
}

export const SIGNATURES: readonly Signature[] = [];

/** First hit per signature id, in log order. */
export function matchSignatures(view: LogView, opts?: { maxHits?: number }): SignatureHit[] {
  void view;
  void opts;
  throw new Error("not implemented");
}

/** Deterministic, no-LLM triage from signatures + excerpt. Used without an API key or when the agent fails. */
export function heuristicTriage(ctx: TriageContext): TriageResult {
  void ctx;
  throw new Error("not implemented");
}
