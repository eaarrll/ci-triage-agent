import type { JobInfo, LogExcerpt, LogView, NumberedLine } from "./types.js";

// CONTRACT STUB — implemented by the log-processing module owner.

/** Raw logs above this size keep their head and tail and drop the middle. */
export const MAX_LOG_BYTES = 20 * 1024 * 1024;

export interface ParseOptions {
  maxBytes?: number;
}

/** Normalize a raw GitHub job log (strip ANSI + timestamps, attribute lines to steps). */
export function parseJobLog(raw: string, job: JobInfo, opts?: ParseOptions): LogView {
  void raw;
  void job;
  void opts;
  throw new Error("not implemented");
}

export interface ExcerptOptions {
  /** Total line budget across all ranges. Default 160. */
  maxLines?: number;
}

/** Pick the windows of the log most likely to explain the failure. */
export function extractExcerpt(view: LogView, job: JobInfo, opts?: ExcerptOptions): LogExcerpt {
  void view;
  void job;
  void opts;
  throw new Error("not implemented");
}

/** Render numbered lines as `  123 | text` (right-aligned numbers). */
export function formatLines(lines: readonly NumberedLine[]): string {
  void lines;
  throw new Error("not implemented");
}
