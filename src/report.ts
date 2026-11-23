import type { ExistingComment, ReportMeta, RunInfo, TriageResult } from "./types.js";

// CONTRACT STUB — implemented by the report/config module owner.

/** Hidden HTML marker identifying this action's comment for one workflow on a PR. */
export function commentMarker(run: RunInfo): string {
  void run;
  throw new Error("not implemented");
}

/** Make model-written text safe to embed in a GitHub comment. */
export function sanitizeModelText(text: string): string {
  void text;
  throw new Error("not implemented");
}

/** PR comment body (starts with commentMarker(meta.run)). */
export function renderComment(result: TriageResult, meta: ReportMeta): string {
  void result;
  void meta;
  throw new Error("not implemented");
}

/** Job summary markdown: the comment content plus usage, cost and the agent's tool trace. */
export function renderSummary(result: TriageResult, meta: ReportMeta): string {
  void result;
  void meta;
  throw new Error("not implemented");
}

/** Body for an earlier triage comment once the same workflow passes again. */
export function renderResolved(previous: ExistingComment, run: RunInfo): string {
  void previous;
  void run;
  throw new Error("not implemented");
}
