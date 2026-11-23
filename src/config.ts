import type { Config, RepoRef } from "./types.js";

// CONTRACT STUB — implemented by the report/config module owner.

export interface InputSource {
  /** Like core.getInput: returns "" when unset. */
  getInput(name: string): string;
}

export interface GitHubEventContext {
  repo: RepoRef;
  /** github.run_id of the run executing this action */
  runId: number;
  eventName: string;
  payload: Record<string, unknown>;
}

/** Validate inputs and resolve which run to triage. Throws Error with a user-facing message on bad input. */
export function readConfig(inputs: InputSource, gh: GitHubEventContext): Config {
  void inputs;
  void gh;
  throw new Error("not implemented");
}
