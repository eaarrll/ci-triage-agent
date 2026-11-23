import type { AgentLogger, TriageBackend, TriageContext } from "./types.js";

// CONTRACT STUB — implemented by the log-processing module owner.

export interface BuildContextOptions {
  /** Default 4. */
  maxFailedJobs?: number;
  /** Per failed job. Default 160. */
  excerptMaxLines?: number;
  logger?: AgentLogger;
}

/** Deterministic pre-processing: everything the agent sees before its first tool call. */
export async function buildContext(backend: TriageBackend, opts?: BuildContextOptions): Promise<TriageContext> {
  void backend;
  void opts;
  throw new Error("not implemented");
}
