import type { UsageTotals } from "../types.js";

/** USD per million tokens. */
export interface ModelPrice {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
}

/**
 * First-party list prices. Two simplifications, both of which can only under-report:
 * - `cacheWrite` is the 5-minute TTL rate (1.25x input); the agent never asks for the 1-hour TTL.
 * - Claude Haiku 5.5 bills prompts above 100K tokens at a higher tier, which is ignored here
 *   because a triage conversation stays well below that.
 */
const PRICES: Readonly<Record<string, ModelPrice>> = {
  "claude-opus-5-5": { input: 4, output: 20, cacheRead: 0.2, cacheWrite: 5 },
  "claude-opus-5": { input: 5, output: 25, cacheRead: 0.5, cacheWrite: 6.25 },
  "claude-opus-4-8": { input: 5, output: 25, cacheRead: 0.5, cacheWrite: 6.25 },
  "claude-opus-4-7": { input: 5, output: 25, cacheRead: 0.5, cacheWrite: 6.25 },
  "claude-opus-4-6": { input: 5, output: 25, cacheRead: 0.5, cacheWrite: 6.25 },
  "claude-sonnet-5-5": { input: 2, output: 10, cacheRead: 0.1, cacheWrite: 2.5 },
  "claude-sonnet-5": { input: 2, output: 10, cacheRead: 0.2, cacheWrite: 2.5 },
  "claude-sonnet-4-6": { input: 3, output: 15, cacheRead: 0.3, cacheWrite: 3.75 },
  "claude-haiku-5-5": { input: 0.1, output: 0.5, cacheRead: 0.01, cacheWrite: 0.125 },
  "claude-haiku-4-5": { input: 1, output: 5, cacheRead: 0.1, cacheWrite: 1.25 },
  "claude-fable-5-2": { input: 8, output: 40, cacheRead: 0.2, cacheWrite: 10 },
  "claude-fable-5-1": { input: 10, output: 50, cacheRead: 1, cacheWrite: 12.5 },
  "claude-fable-5": { input: 10, output: 50, cacheRead: 1, cacheWrite: 12.5 },
};

/** Cloud provider prefixes such as "anthropic." or "us.anthropic." (Amazon Bedrock style). */
const PROVIDER_PREFIX = /^(?:[a-z]{2,6}\.)?anthropic\./;

/** The first-party model id without a provider prefix; everything else is kept as is. */
export function normalizeModelId(model: string): string {
  return model.trim().replace(PROVIDER_PREFIX, "");
}

export function priceFor(model: string): ModelPrice | null {
  return PRICES[normalizeModelId(model)] ?? null;
}

export function emptyUsage(): UsageTotals {
  return {
    requests: 0,
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    costUsd: 0,
  };
}

export interface ApiUsage {
  input_tokens: number;
  output_tokens: number;
  cache_read_input_tokens?: number | null;
  cache_creation_input_tokens?: number | null;
}

/** Returns a new totals object with one response's usage added, priced by the model that served it. */
export function addUsage(totals: UsageTotals, model: string, usage: ApiUsage): UsageTotals {
  const cacheRead = usage.cache_read_input_tokens ?? 0;
  const cacheWrite = usage.cache_creation_input_tokens ?? 0;
  const price = priceFor(model);
  const responseCost =
    price === null
      ? null
      : (usage.input_tokens * price.input +
          usage.output_tokens * price.output +
          cacheRead * price.cacheRead +
          cacheWrite * price.cacheWrite) /
        1_000_000;

  return {
    requests: totals.requests + 1,
    inputTokens: totals.inputTokens + usage.input_tokens,
    outputTokens: totals.outputTokens + usage.output_tokens,
    cacheReadTokens: totals.cacheReadTokens + cacheRead,
    cacheWriteTokens: totals.cacheWriteTokens + cacheWrite,
    // One unpriced response makes the whole total unknown; a partial sum would look authoritative.
    costUsd: totals.costUsd === null || responseCost === null ? null : totals.costUsd + responseCost,
  };
}
