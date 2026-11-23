import type { UsageTotals } from "../types.js";

// CONTRACT STUB — implemented by the agent module owner.

/** USD per million tokens. */
export interface ModelPrice {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
}

export function priceFor(model: string): ModelPrice | null {
  void model;
  throw new Error("not implemented");
}

export function emptyUsage(): UsageTotals {
  throw new Error("not implemented");
}

export interface ApiUsage {
  input_tokens: number;
  output_tokens: number;
  cache_read_input_tokens?: number | null;
  cache_creation_input_tokens?: number | null;
}

/** Returns a new totals object with one response's usage added, priced by the model that served it. */
export function addUsage(totals: UsageTotals, model: string, usage: ApiUsage): UsageTotals {
  void totals;
  void model;
  void usage;
  throw new Error("not implemented");
}
