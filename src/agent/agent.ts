import type Anthropic from "@anthropic-ai/sdk";
import type { AgentLogger, Effort, TriageBackend, TriageContext, TriageOutcome } from "../types.js";

// CONTRACT STUB — implemented by the agent module owner.

export interface AgentOptions {
  model: string;
  effort: Effort;
  maxTurns: number;
  maxCostUsd: number;
  timeoutMs: number;
  extraInstructions: string | null;
  /** Injected in tests and evals; defaults to `new Anthropic({ apiKey })`. */
  client?: Anthropic;
  apiKey?: string;
  logger?: AgentLogger;
}

/** Investigate the failure with read-only tools and return a structured triage. Never throws. */
export async function runTriage(
  ctx: TriageContext,
  backend: TriageBackend,
  opts: AgentOptions,
): Promise<TriageOutcome> {
  void ctx;
  void backend;
  void opts;
  throw new Error("not implemented");
}
