import type { TriageBackend } from "./types.js";

// CONTRACT STUB — implemented by the redaction module owner.

export interface RedactionResult {
  text: string;
  /** number of secrets replaced */
  count: number;
}

/** Replace secrets in free text with `[REDACTED:<kind>]`. Pure and idempotent. */
export function redactSecrets(text: string): RedactionResult {
  void text;
  throw new Error("not implemented");
}

export interface RedactingBackend extends TriageBackend {
  /** Total secrets redacted across every string this backend has returned so far. */
  readonly redactionCount: number;
}

/** Wrap a backend so every string it returns (logs, files, patches, titles) is redacted. */
export function withRedaction(inner: TriageBackend): RedactingBackend {
  void inner;
  throw new Error("not implemented");
}
