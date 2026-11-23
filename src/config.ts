import type { Config, Effort, RepoRef } from "./types.js";

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

/**
 * Invalid action input. The message names the input and what it accepts but never echoes
 * the value: a secret pasted into the wrong input must not end up in the logs.
 */
export class ConfigError extends Error {
  override name = "ConfigError";
}

const DEFAULT_MODEL = "claude-opus-5-5";
const MODEL_ID = /^[A-Za-z0-9._:@/-]+$/;
const EFFORTS: readonly Effort[] = ["low", "medium", "high", "xhigh", "max"];
const MAX_EXTRA_INSTRUCTIONS = 4000;

const BOOLEAN_WORDS = new Map<string, boolean>([
  ["true", true],
  ["yes", true],
  ["on", true],
  ["1", true],
  ["false", false],
  ["no", false],
  ["off", false],
  ["0", false],
]);

interface IntegerRange {
  fallback: number;
  min: number;
  max: number;
}

/** Validate inputs and resolve which run to triage. Throws Error with a user-facing message on bad input. */
export function readConfig(inputs: InputSource, gh: GitHubEventContext): Config {
  const read = (name: string): string => inputs.getInput(name).trim();
  return {
    apiKey: read("anthropic-api-key") || null,
    githubToken: requireToken(read("github-token")),
    model: parseModel(read("model")),
    effort: parseEffort(read("effort")),
    repo: { owner: gh.repo.owner, repo: gh.repo.repo },
    runId: resolveRunId(read("run-id"), gh),
    comment: parseBoolean("comment", read("comment"), true),
    resolveOnSuccess: parseBoolean("resolve-on-success", read("resolve-on-success"), true),
    maxTurns: parseInteger("max-turns", read("max-turns"), { fallback: 12, min: 1, max: 50 }),
    maxCostUsd: parseMaxCost(read("max-cost-usd")),
    timeoutSeconds: parseInteger("timeout-seconds", read("timeout-seconds"), {
      fallback: 300,
      min: 30,
      max: 1800,
    }),
    maxFailedJobs: parseInteger("max-failed-jobs", read("max-failed-jobs"), { fallback: 4, min: 1, max: 10 }),
    failOnError: parseBoolean("fail-on-error", read("fail-on-error"), false),
    extraInstructions: parseExtraInstructions(read("extra-instructions")),
  };
}

function invalid(input: string, expected: string): ConfigError {
  return new ConfigError(`Invalid input "${input}": expected ${expected}.`);
}

function requireToken(value: string): string {
  if (value) return value;
  throw new ConfigError(
    'Input "github-token" is required: pass a token with actions: read, contents: read and pull-requests: write (the default is github.token).',
  );
}

function parseModel(value: string): string {
  const model = value || DEFAULT_MODEL;
  if (MODEL_ID.test(model)) return model;
  throw invalid("model", `a model ID such as "${DEFAULT_MODEL}" (letters, digits and . _ : @ / - only)`);
}

function parseEffort(value: string): Effort {
  const effort = value.toLowerCase() || "medium";
  const match = EFFORTS.find((candidate) => candidate === effort);
  if (match) return match;
  throw invalid("effort", `one of ${EFFORTS.join(", ")}`);
}

function parseBoolean(input: string, value: string, fallback: boolean): boolean {
  if (!value) return fallback;
  const parsed = BOOLEAN_WORDS.get(value.toLowerCase());
  if (parsed !== undefined) return parsed;
  throw invalid(input, `one of ${[...BOOLEAN_WORDS.keys()].join(", ")} (case-insensitive)`);
}

function parseInteger(input: string, value: string, range: IntegerRange): number {
  if (!value) return range.fallback;
  const parsed = /^\d+$/.test(value) ? Number(value) : Number.NaN;
  if (Number.isSafeInteger(parsed) && parsed >= range.min && parsed <= range.max) return parsed;
  throw invalid(input, `an integer from ${range.min} to ${range.max}`);
}

function parseMaxCost(value: string): number {
  if (!value) return 0.5;
  // Plain decimals only: Number() would also accept "1e1", "0x10" and "Infinity".
  const parsed = /^(?:\d+(?:\.\d*)?|\.\d+)$/.test(value) ? Number(value) : Number.NaN;
  if (parsed > 0 && parsed <= 20) return parsed;
  throw invalid("max-cost-usd", "a number of US dollars greater than 0 and at most 20");
}

function parseExtraInstructions(value: string): string | null {
  if (!value) return null;
  if (value.length <= MAX_EXTRA_INSTRUCTIONS) return value;
  const cut = value.slice(0, MAX_EXTRA_INSTRUCTIONS);
  // Drop a dangling high surrogate rather than send half an emoji.
  return /[\ud800-\udbff]$/.test(cut) ? cut.slice(0, -1) : cut;
}

/**
 * The run to triage: the explicit run-id input, else the run that triggered a workflow_run
 * event, else the run executing this action (the action runs as a step of the failing workflow).
 */
function resolveRunId(value: string, gh: GitHubEventContext): number {
  if (value) {
    const parsed = /^\d+$/.test(value) ? Number(value) : Number.NaN;
    if (isPositiveInteger(parsed)) return parsed;
    throw invalid("run-id", "a positive integer (a workflow run ID)");
  }
  if (gh.eventName === "workflow_run") {
    // Falling back to gh.runId here would triage this triage workflow instead of the failed one.
    const triggeringRun = gh.payload["workflow_run"];
    const id = isRecord(triggeringRun) ? triggeringRun["id"] : undefined;
    if (isPositiveInteger(id)) return id;
    throw new ConfigError("The workflow_run event payload has no workflow_run.id; set the run-id input.");
  }
  if (isPositiveInteger(gh.runId)) return gh.runId;
  throw new ConfigError("Could not determine which workflow run to triage; set the run-id input.");
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
