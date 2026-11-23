import type { TriageContext } from "../types.js";

// CONTRACT STUB — implemented by the agent module owner.

/** Stable system prompt (cacheable) + optional repo-specific instructions from the workflow author. */
export function buildSystemPrompt(extraInstructions: string | null): string {
  void extraInstructions;
  throw new Error("not implemented");
}

/** The first user message: run metadata, failed jobs, excerpts, signature hints, changed files. */
export function renderContext(ctx: TriageContext): string {
  void ctx;
  throw new Error("not implemented");
}
