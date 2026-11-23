import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import type { Category, Confidence, TriageResult } from "../types.js";

// Length limits live in the descriptions, not in the schema: structured outputs do not
// support minLength/maxItems, and the SDK would turn them into client-side checks that
// reject an otherwise useful answer over one extra character.

const CATEGORY_VALUES = [
  "code",
  "flaky",
  "dependency",
  "infrastructure",
  "cloud_auth",
  "configuration",
  "unknown",
] as const satisfies readonly Category[];

const CONFIDENCE_VALUES = ["high", "medium", "low"] as const satisfies readonly Confidence[];

// Not z.int(): its JSON Schema carries safe-integer bounds that structured outputs cannot
// enforce, so the SDK would push them into the description as noise for the model.
const wholeNumber = () => z.number().refine(Number.isInteger, { message: "must be a whole number" });

const EvidenceSchema = z.object({
  job: z.string().describe("Exact name of the job whose log or files this evidence comes from."),
  line: wholeNumber()
    .nullable()
    .describe(
      "Line number in that job's numbered log, exactly as shown in the excerpt or a tool result. " +
        "null when the evidence is not a log line (for example a diff hunk or a file).",
    ),
  excerpt: z
    .string()
    .describe(
      "The exact text quoted from the log, diff or file (one line or a few short lines). Never paraphrase.",
    ),
});

const FixLocationSchema = z.object({
  path: z.string().describe("Repository-relative path of the file to change, e.g. src/pricing/discount.ts."),
  line: wholeNumber()
    .nullable()
    .describe("1-based line in that file at the head commit, or null if not pinned down."),
});

export const TriageResultSchema = z.object({
  category: z
    .enum(CATEGORY_VALUES)
    .describe(
      "Who has to act: the single category that best explains the failure (see the category definitions).",
    ),
  title: z
    .string()
    .describe(
      "Specific one-line headline, at most 100 characters, naming the actual cause, " +
        'e.g. "applyDiscount() now rounds before subtracting". Not "Tests failed".',
    ),
  root_cause: z.string().describe("1-3 sentences: what failed, and why. Plain text, no headings."),
  evidence: z
    .array(EvidenceSchema)
    .describe("1-5 items, strongest first, each quoting an exact line that supports the root cause."),
  suggested_fix: z
    .string()
    .describe(
      "Concise markdown, at most 8 lines: the concrete next action(s). May contain one small code block. " +
        "Never suggest piping a remote script into a shell.",
    ),
  fix_location: FixLocationSchema.nullable().describe(
    "The file (and line) that should change when the fix is a code or config edit in this repository; otherwise null.",
  ),
  confidence: z
    .enum(CONFIDENCE_VALUES)
    .describe(
      "high: verified with tools and the evidence directly shows the cause. " +
        "medium: strong evidence but one link is inferred. low: plausible guess from partial evidence.",
    ),
  flaky_suspected: z
    .boolean()
    .describe(
      "true only with evidence of nondeterminism (passes on other attempts or unrelated runs, timing/network errors).",
    ),
  rerun_recommended: z.boolean().describe("true when simply re-running the job is likely to pass."),
});

type Equals<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
// Compile-time guard: the schema must describe exactly the contract in types.ts.
const schemaMatchesContract: Equals<z.infer<typeof TriageResultSchema>, TriageResult> = true;
void schemaMatchesContract;

/** `output_config.format` for the Messages API, built from the schema above. */
export const TRIAGE_OUTPUT_FORMAT = betaZodOutputFormat(TriageResultSchema);

/**
 * Parse the model's final text into a TriageResult, or null when it is not a valid one.
 * Tolerates a code fence or stray prose around the object, which structured outputs
 * should prevent but a fallback model or a cut-off reply can still produce.
 */
export function parseTriageResult(text: string): TriageResult | null {
  for (const candidate of jsonCandidates(text)) {
    let value: unknown;
    try {
      value = JSON.parse(candidate);
    } catch {
      continue;
    }
    const parsed = TriageResultSchema.safeParse(value);
    if (parsed.success) return parsed.data;
  }
  return null;
}

function jsonCandidates(text: string): string[] {
  const trimmed = text.trim();
  const candidates = [trimmed];
  const first = trimmed.indexOf("{");
  const last = trimmed.lastIndexOf("}");
  if (first > 0 || (last !== -1 && last < trimmed.length - 1)) {
    if (first !== -1 && last > first) candidates.push(trimmed.slice(first, last + 1));
  }
  return candidates;
}
