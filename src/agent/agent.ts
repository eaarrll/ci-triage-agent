import Anthropic, {
  APIConnectionError,
  APIConnectionTimeoutError,
  APIError,
  APIUserAbortError,
  AuthenticationError,
  BadRequestError,
  NotFoundError,
  PermissionDeniedError,
  RateLimitError,
} from "@anthropic-ai/sdk";
import type {
  BetaContentBlockParam,
  BetaMessage,
  BetaMessageParam,
  BetaToolRunner,
  BetaToolRunnerParams,
} from "@anthropic-ai/sdk/resources/beta/messages/messages";
import type {
  AgentLogger,
  Effort,
  StopCause,
  ToolCallTrace,
  TriageBackend,
  TriageContext,
  TriageOutcome,
  UsageTotals,
} from "../types.js";
import { addUsage, emptyUsage, normalizeModelId } from "./pricing.js";
import { buildSystemPrompt, renderContext } from "./prompt.js";
import { TRIAGE_OUTPUT_FORMAT, parseTriageResult } from "./result-schema.js";
import { createTools } from "./tools.js";

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

/** Non-streaming requests stay well under the SDK's HTTP timeout at this size. */
const MAX_TOKENS = 16_000;
const REQUEST_TIMEOUT_MS = 120_000;
const MAX_RETRIES = 3;
/** Past this share of the time budget the next request is the final one. */
const FINALIZE_AT_TIME_SHARE = 0.8;

const FALLBACK_BETA = "server-side-fallback-2026-07-01";
/**
 * Models that accept server-side refusal fallbacks (`fallbacks: "default"`). Matched on the exact
 * first-party id: a provider-prefixed id means a cloud platform, where the parameter is unavailable.
 */
const FALLBACK_MODELS = new Set([
  "claude-opus-5-5",
  "claude-opus-5",
  "claude-sonnet-5-5",
  "claude-fable-5-2",
  "claude-fable-5-1",
]);
/** Models that accept a `role: "system"` message inside `messages`. */
const SYSTEM_MESSAGE_MODELS = new Set([
  "claude-opus-5-5",
  "claude-opus-5",
  "claude-opus-4-8",
  "claude-sonnet-5-5",
  "claude-haiku-5-5",
]);

const ALL_EFFORTS: readonly Effort[] = ["low", "medium", "high", "xhigh", "max"];

type BudgetCause = Exclude<StopCause, "complete">;

const FINAL_INSTRUCTIONS: Record<BudgetCause, string> = {
  budget: "The cost budget for this investigation is used up.",
  max_turns: "The turn limit for this investigation is reached.",
  timeout: "The time limit for this investigation is nearly reached.",
};

const ANSWER_NOW =
  "Do not call any more tools. Using only the evidence gathered so far, reply now with the final triage JSON object. " +
  'If the evidence is not conclusive, say so in root_cause, lower the confidence, and use category "unknown" if needed.';

const REPAIR_REQUEST =
  "Your previous reply was not a valid triage JSON object. Reply with only the JSON object that matches the " +
  "required schema: no prose, no code fences.";

/** Mutable bookkeeping shared by the loop and the error path, so a failure still reports what was spent. */
interface RunState {
  usage: UsageTotals;
  trace: ToolCallTrace[];
  turns: number;
}

class DeadlineExceeded extends Error {}

/** Investigate the failure with read-only tools and return a structured triage. Never throws. */
export async function runTriage(
  ctx: TriageContext,
  backend: TriageBackend,
  opts: AgentOptions,
): Promise<TriageOutcome> {
  const state: RunState = { usage: emptyUsage(), trace: [], turns: 0 };
  const deadline = new AbortController();
  const timer = setTimeout(() => deadline.abort(), opts.timeoutMs);
  try {
    // The race guarantees an answer at the deadline even if a tool call is stuck on a slow backend.
    return await Promise.race([
      investigate(ctx, backend, opts, state, deadline.signal),
      rejectOnAbort(deadline.signal),
    ]);
  } catch (error) {
    return failure(state, describeError(error, opts));
  } finally {
    clearTimeout(timer);
    deadline.abort();
  }
}

/*
 * The loop runs on the SDK tool runner. Each yielded message is one API response; the loop
 * body prices it, checks for a refusal or a final answer, and steers the next request
 * through the runner's documented hooks: after `setMessagesParams()` in the loop body the
 * runner sends exactly the messages given and runs no tools on its own, so the budget
 * finalization and the repair request are both "append these messages, send once more".
 */
async function investigate(
  ctx: TriageContext,
  backend: TriageBackend,
  opts: AgentOptions,
  state: RunState,
  signal: AbortSignal,
): Promise<TriageOutcome> {
  const started = performance.now();
  const { logger } = opts;
  const client =
    opts.client ??
    new Anthropic({ apiKey: opts.apiKey, maxRetries: MAX_RETRIES, timeout: REQUEST_TIMEOUT_MS });
  const tools = createTools({
    ctx,
    backend,
    ...(logger && { logger }),
    // Tools run after the response that asked for them, so the current turn is the right one.
    onCall: (call) => state.trace.push({ turn: state.turns, ...call }),
  });

  const startFinal = opts.maxTurns <= 1;
  const runner = client.beta.messages.toolRunner(buildParams(ctx, opts, tools, startFinal), { signal });

  let stopCause: StopCause = startFinal ? "max_turns" : "complete";
  let finalRequested = startFinal;
  let repairRequested = false;
  let warnedUnpriced = false;

  for await (const message of runner) {
    state.turns += 1;
    state.usage = addUsage(state.usage, message.model, message.usage);
    logTurn(logger, state, message);

    if (message.stop_reason === "refusal") return refusal(state, message);
    // Only server tools pause a turn; the runner resumes it by itself.
    if (message.stop_reason === "pause_turn") continue;

    if (message.stop_reason === "tool_use" && !finalRequested) {
      if (state.usage.costUsd === null && !warnedUnpriced) {
        warnedUnpriced = true;
        logger?.warning(`No price is known for ${message.model}; the cost budget cannot be enforced.`);
      }
      const cause = budgetCause(state, opts, performance.now() - started);
      if (cause) {
        stopCause = cause;
        finalRequested = true;
        logger?.info(`${FINAL_INSTRUCTIONS[cause]} Asking for the final answer.`);
        await requestFinalAnswer(runner, message, cause);
      }
      continue;
    }

    const result = parseTriageResult(finalText(message));
    if (result) {
      return {
        status: "ok",
        result,
        usage: state.usage,
        trace: [...state.trace],
        turns: state.turns,
        stopCause,
        modelUsed: message.model,
      };
    }
    if (repairRequested) {
      return failure(
        state,
        "the final answer was not a valid triage JSON object, even after a repair request",
      );
    }
    repairRequested = true;
    logger?.warning(
      `The final answer was not valid triage JSON (stop reason ${message.stop_reason}); asking once more.`,
    );
    await requestRepair(runner, message);
  }

  return failure(state, `the agent stopped after ${state.turns} turns without a final answer`);
}

function buildParams(
  ctx: TriageContext,
  opts: AgentOptions,
  tools: BetaToolRunnerParams["tools"],
  startFinal: boolean,
): BetaToolRunnerParams & { stream?: false } {
  const effort = effortFor(opts.model, opts.effort);
  const context = renderContext(ctx);
  return {
    model: opts.model,
    max_tokens: MAX_TOKENS,
    // One explicit breakpoint after the stable tools + system prefix, plus automatic caching
    // of the growing conversation tail.
    system: [
      { type: "text", text: buildSystemPrompt(opts.extraInstructions), cache_control: { type: "ephemeral" } },
    ],
    cache_control: { type: "ephemeral" },
    messages: [
      {
        role: "user",
        content: startFinal
          ? [
              { type: "text", text: context },
              { type: "text", text: `${FINAL_INSTRUCTIONS.max_turns} ${ANSWER_NOW}` },
            ]
          : context,
      },
    ],
    tools,
    ...(startFinal && { tool_choice: { type: "none" } }),
    // Thinking is left at the model default (adaptive where supported); effort is the only dial.
    output_config: { ...(effort && { effort }), format: TRIAGE_OUTPUT_FORMAT },
    ...(FALLBACK_MODELS.has(opts.model) && {
      betas: [FALLBACK_BETA],
      fallbacks: "default",
    }),
    // Initial turns, the final answer, and one repair request; the loop stops itself earlier.
    max_iterations: Math.max(opts.maxTurns, 1) + 1,
    // Full history on every request: no server-held thread state, so each request is
    // self-contained and the run works under zero-data-retention settings.
    thread: false,
  };
}

function budgetCause(state: RunState, opts: AgentOptions, elapsedMs: number): BudgetCause | null {
  if (state.usage.costUsd !== null && state.usage.costUsd >= opts.maxCostUsd) return "budget";
  if (state.turns >= opts.maxTurns - 1) return "max_turns";
  if (elapsedMs >= opts.timeoutMs * FINALIZE_AT_TIME_SHARE) return "timeout";
  return null;
}

/** Answer the pending tool calls, then make the next request a tool-less final one. */
async function requestFinalAnswer(
  runner: BetaToolRunner<false>,
  message: BetaMessage,
  cause: BudgetCause,
): Promise<void> {
  const results = await toolResults(runner);
  const instruction = `${FINAL_INSTRUCTIONS[cause]} ${ANSWER_NOW}`;
  // A system message is the operator channel; older models get the same text after the tool results.
  const followUp: BetaMessageParam[] =
    supportsSystemMessages(message.model) && results.length > 0
      ? [
          { role: "user", content: results },
          { role: "system", content: instruction },
        ]
      : [{ role: "user", content: [...results, { type: "text", text: instruction }] }];
  continueWith(runner, message, followUp);
}

async function requestRepair(runner: BetaToolRunner<false>, message: BetaMessage): Promise<void> {
  // A reply cut off at max_tokens can end in a tool call; the API needs a result for it.
  const results = await toolResults(runner);
  continueWith(runner, message, [
    { role: "user", content: [...results, { type: "text", text: REPAIR_REQUEST }] },
  ]);
}

async function toolResults(runner: BetaToolRunner<false>): Promise<BetaContentBlockParam[]> {
  const response = await runner.generateToolResponse();
  if (!response) return [];
  return typeof response.content === "string" ? [{ type: "text", text: response.content }] : response.content;
}

function continueWith(
  runner: BetaToolRunner<false>,
  message: BetaMessage,
  followUp: BetaMessageParam[],
): void {
  runner.setMessagesParams((params) => ({
    ...params,
    tool_choice: { type: "none" },
    // While the loop body runs, params.messages does not hold the reply yet; it goes back unchanged.
    messages: [...params.messages, { role: "assistant", content: message.content }, ...followUp],
  }));
}

// ---------------------------------------------------------------------------
// Model capabilities
// ---------------------------------------------------------------------------

function supportedEfforts(model: string): readonly Effort[] {
  const id = normalizeModelId(model);
  if (/^claude-(fable|mythos)-/.test(id)) return ALL_EFFORTS;
  if (/^claude-(opus|sonnet|haiku)-([5-9]|\d{2,})(-|$)/.test(id)) return ALL_EFFORTS;
  if (/^claude-opus-4-[78](-|$)/.test(id)) return ALL_EFFORTS;
  if (/^claude-(opus|sonnet)-4-6(-|$)/.test(id)) return ["low", "medium", "high", "max"];
  if (/^claude-opus-4-5(-|$)/.test(id)) return ["low", "medium", "high"];
  return [];
}

/** The requested effort, stepped down to the highest level the model accepts; null when it has no effort control. */
export function effortFor(model: string, requested: Effort): Effort | null {
  const supported = supportedEfforts(model);
  if (supported.length === 0) return null;
  if (supported.includes(requested)) return requested;
  const ceiling = ALL_EFFORTS.indexOf(requested);
  return (
    [...supported].reverse().find((level) => ALL_EFFORTS.indexOf(level) < ceiling) ?? supported[0] ?? null
  );
}

function supportsSystemMessages(model: string): boolean {
  const id = normalizeModelId(model);
  return SYSTEM_MESSAGE_MODELS.has(id) || /^claude-(fable|mythos)-5(-|$)/.test(id);
}

// ---------------------------------------------------------------------------
// Outcomes
// ---------------------------------------------------------------------------

function finalText(message: BetaMessage): string {
  return message.content.map((block) => (block.type === "text" ? block.text : "")).join("");
}

function refusal(state: RunState, message: BetaMessage): TriageOutcome {
  const details = message.stop_details;
  const category = details?.category ? ` (${details.category})` : "";
  const explanation = details?.explanation ? `: ${details.explanation}` : "";
  return {
    status: "refused",
    usage: state.usage,
    trace: [...state.trace],
    turns: state.turns,
    message: `Claude declined to triage this run${category}${explanation}`,
  };
}

function failure(state: RunState, message: string): TriageOutcome {
  return { status: "error", usage: state.usage, trace: [...state.trace], turns: state.turns, message };
}

function logTurn(logger: AgentLogger | undefined, state: RunState, message: BetaMessage): void {
  if (!logger) return;
  const calls = message.content.flatMap((block) => (block.type === "tool_use" ? [block.name] : []));
  const summary =
    calls.length > 0 ? calls.join(", ") : message.stop_reason === "refusal" ? "refusal" : "final answer";
  logger.info(`Turn ${state.turns}: ${summary}`);
  const { usage } = message;
  const cost = state.usage.costUsd === null ? "unknown" : `$${state.usage.costUsd.toFixed(4)}`;
  logger.debug(
    `turn ${state.turns}: model=${message.model} stop=${message.stop_reason} input=${usage.input_tokens} ` +
      `output=${usage.output_tokens} cache_read=${usage.cache_read_input_tokens ?? 0} ` +
      `cache_write=${usage.cache_creation_input_tokens ?? 0} total_cost=${cost}`,
  );
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

function rejectOnAbort(signal: AbortSignal): Promise<never> {
  return new Promise((_, reject) => {
    signal.addEventListener("abort", () => reject(new DeadlineExceeded()), { once: true });
  });
}

/** A one-line, operator-facing reason. Never includes the API key. */
function describeError(error: unknown, opts: Pick<AgentOptions, "apiKey" | "timeoutMs">): string {
  return scrubSecrets(errorReason(error, opts.timeoutMs), opts.apiKey);
}

function errorReason(error: unknown, timeoutMs: number): string {
  if (error instanceof DeadlineExceeded || error instanceof APIUserAbortError) {
    return `the agent timed out after ${Math.round(timeoutMs / 1000)}s`;
  }
  if (error instanceof AuthenticationError)
    return "Anthropic API key rejected (401); check the API key secret";
  if (error instanceof PermissionDeniedError)
    return `Anthropic API permission denied (403): ${apiDetail(error)}`;
  if (error instanceof RateLimitError) return "Anthropic API rate limit exceeded (429), even after retries";
  if (error instanceof NotFoundError)
    return `Anthropic API returned 404, often an unknown model id: ${apiDetail(error)}`;
  if (error instanceof BadRequestError)
    return `Anthropic API rejected the request (400): ${apiDetail(error)}`;
  if (error instanceof APIConnectionTimeoutError) return "the Anthropic API request timed out";
  if (error instanceof APIConnectionError) return `could not reach the Anthropic API: ${error.message}`;
  if (error instanceof APIError)
    return `Anthropic API error ${error.status ?? "(no status)"}: ${apiDetail(error)}`;
  return `the agent failed: ${error instanceof Error ? error.message : String(error)}`;
}

function apiDetail(error: APIError): string {
  return error.apiMessage ?? error.message;
}

function scrubSecrets(text: string, apiKey: string | undefined): string {
  const withoutKey = apiKey ? text.split(apiKey).join("[REDACTED]") : text;
  return withoutKey.replace(/sk-ant-[A-Za-z0-9_-]{8,}/g, "[REDACTED]");
}
