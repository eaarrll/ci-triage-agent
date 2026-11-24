import Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it, vi } from "vitest";
import { effortFor, MAX_TOOL_CALLS_PER_TURN, runTriage, type AgentOptions } from "../src/agent/agent.js";
import type {
  AgentLogger,
  JobHistoryEntry,
  JobInfo,
  LogView,
  NumberedLine,
  RunInfo,
  TriageBackend,
  TriageContext,
  TriageOutcome,
  TriageResult,
} from "../src/types.js";

// The agent must never reach the real log parser in these tests: every log is a fake view.
vi.mock("../src/logs.js", () => ({
  parseJobLog: vi.fn(() => {
    throw new Error("parseJobLog should not be called in agent tests");
  }),
}));

// ---------------------------------------------------------------------------
// Scripted Messages API
// ---------------------------------------------------------------------------

interface RecordedRequest {
  url: string;
  body: Record<string, unknown> & { messages: Array<{ role: string; content: unknown }> };
  headers: Headers;
}

type Step = Response | ((signal: AbortSignal | undefined) => Promise<Response>);

/** A real SDK client whose fetch replays scripted responses and records every request body. */
function scriptedClient(steps: Step[]) {
  const requests: RecordedRequest[] = [];
  const fetch = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    requests.push({
      url,
      body: JSON.parse(String(init?.body)) as RecordedRequest["body"],
      headers: new Headers(init?.headers),
    });
    const step = steps[requests.length - 1];
    if (!step) throw new Error(`unexpected request #${requests.length}`);
    return typeof step === "function" ? step(init?.signal ?? undefined) : step;
  };
  const client = new Anthropic({ apiKey: "sk-test", fetch, maxRetries: 0 });
  return { client, requests };
}

let messageCounter = 0;

interface Usage {
  input_tokens: number;
  output_tokens: number;
  cache_read_input_tokens?: number;
  cache_creation_input_tokens?: number;
}

function reply(
  content: unknown[],
  stopReason: string,
  usage: Usage = { input_tokens: 100, output_tokens: 50 },
  extra: Record<string, unknown> = {},
): Response {
  messageCounter += 1;
  const body = {
    id: `msg_test_${messageCounter}`,
    type: "message",
    role: "assistant",
    model: "claude-opus-5-5",
    content,
    stop_reason: stopReason,
    stop_sequence: null,
    stop_details: null,
    container: null,
    context_management: null,
    usage: { cache_read_input_tokens: 0, cache_creation_input_tokens: 0, ...usage },
    ...extra,
  };
  return jsonResponse(body);
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "request-id": `req_test_${messageCounter}` },
  });
}

const thinking = { type: "thinking", thinking: "", signature: "c2lnbmF0dXJlLWZvci10ZXN0cw==" };

function toolUse(id: string, name: string, input: Record<string, unknown>) {
  return { type: "tool_use", id, name, input };
}

const RESULT: TriageResult = {
  category: "code",
  title: "applyDiscount() now rounds the price before subtracting the discount",
  root_cause: "The change rounds the price first, so 9.5 becomes 9 and the discount test fails.",
  evidence: [{ job: "test", line: 6, excerpt: "  Received: 9" }],
  suggested_fix: "Subtract first, then round: `Math.round(price - discount)`.",
  fix_location: { path: "src/discount.ts", line: 2 },
  confidence: "high",
  flaky_suspected: false,
  rerun_recommended: false,
};

const finalAnswer = (result: TriageResult = RESULT) => ({ type: "text", text: JSON.stringify(result) });

// ---------------------------------------------------------------------------
// Triage fixtures
// ---------------------------------------------------------------------------

function fakeLog(job: JobInfo, texts: string[]): LogView {
  const lines: NumberedLine[] = texts.map((text, i) => ({ n: i + 1, text }));
  return {
    jobId: job.id,
    jobName: job.name,
    lineCount: lines.length,
    truncated: false,
    search(pattern, opts = {}) {
      const context = opts.context ?? 3;
      const hits = lines.filter((line) => line.text.toLowerCase().includes(pattern.toLowerCase()));
      return {
        totalMatches: hits.length,
        matches: hits.map((hit) => ({
          line: hit.n,
          context: lines.slice(Math.max(0, hit.n - 1 - context), hit.n + context),
        })),
        truncated: false,
      };
    },
    slice: (start, end) => lines.slice(start - 1, end),
    all: () => lines,
    stepOf: () => null,
    stepRange: () => null,
  };
}

const testJob: JobInfo = {
  id: 2,
  name: "test",
  status: "completed",
  conclusion: "failure",
  startedAt: null,
  completedAt: null,
  runnerLabels: ["ubuntu-latest"],
  htmlUrl: null,
  steps: [],
};

const run: RunInfo = {
  id: 9001,
  attempt: 1,
  workflowId: 3,
  workflowName: "CI",
  workflowPath: ".github/workflows/ci.yml",
  event: "pull_request",
  headBranch: "feature/discounts",
  headSha: "0123456789abcdef0123456789abcdef01234567",
  headRepoFullName: "example-org/shop",
  isFork: false,
  defaultBranch: "main",
  conclusion: "failure",
  htmlUrl: "https://github.com/example-org/shop/actions/runs/9001",
  displayTitle: null,
  pullRequestNumbers: [42],
  createdAt: "2026-11-20T10:00:00Z",
};

function context(): TriageContext {
  const log = fakeLog(testJob, [
    "Run npm test",
    "FAIL src/discount.test.ts",
    "  ● applyDiscount › subtracts before rounding",
    "    expect(received).toBe(expected)",
    "  Expected: 9.5",
    "  Received: 9",
    "##[error]Process completed with exit code 1.",
  ]);
  return {
    run,
    failedJobs: [
      {
        job: testJob,
        failedSteps: [],
        log,
        excerpt: {
          failedSteps: ["Run tests"],
          ranges: [{ start: 1, end: 7, lines: [...log.all()] }],
          signalLines: [6],
          totalLines: 7,
        },
        signatures: [],
      },
    ],
    omittedFailedJobs: [],
    allJobs: [testJob],
    changedFiles: [
      {
        path: "src/discount.ts",
        status: "modified",
        additions: 1,
        deletions: 1,
        patch:
          "@@ -2 +2 @@\n-  return Math.round(price - discount);\n+  return Math.round(price) - discount;",
        previousPath: null,
      },
    ],
  };
}

function backend(overrides: Partial<TriageBackend> = {}): TriageBackend {
  return {
    repo: { owner: "example-org", repo: "shop" },
    getRun: async () => run,
    listJobs: async () => [testJob],
    getJobLog: async () => "",
    readFile: async () => null,
    listDirectory: async () => null,
    getChangedFiles: async () => [],
    getJobHistory: async (): Promise<JobHistoryEntry[]> => [],
    ...overrides,
  };
}

function logger() {
  const lines: Record<keyof AgentLogger, string[]> = { info: [], warning: [], debug: [] };
  const log: AgentLogger = {
    info: (msg) => lines.info.push(msg),
    warning: (msg) => lines.warning.push(msg),
    debug: (msg) => lines.debug.push(msg),
  };
  return { log, lines };
}

function options(client: Anthropic, overrides: Partial<AgentOptions> = {}): AgentOptions {
  return {
    model: "claude-opus-5-5",
    effort: "high",
    maxTurns: 10,
    maxCostUsd: 5,
    timeoutMs: 60_000,
    extraInstructions: null,
    client,
    ...overrides,
  };
}

function expectOk(outcome: TriageOutcome): Extract<TriageOutcome, { status: "ok" }> {
  if (outcome.status !== "ok") throw new Error(`expected ok, got ${outcome.status}: ${outcome.message}`);
  return outcome;
}

function lastMessage(request: RecordedRequest | undefined) {
  const message = request?.body.messages.at(-1);
  if (!message) throw new Error("request has no messages");
  return message;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("runTriage", () => {
  it("investigates with tools, then returns the structured result", async () => {
    const { client, requests } = scriptedClient([
      reply(
        [thinking, toolUse("toolu_1", "search_log", { job: "test", pattern: "Received", context: 1 })],
        "tool_use",
        {
          input_tokens: 3000,
          output_tokens: 200,
          cache_creation_input_tokens: 5000,
        },
      ),
      reply([thinking, toolUse("toolu_2", "get_file_diff", { path: "src/discount.ts" })], "tool_use", {
        input_tokens: 400,
        output_tokens: 150,
        cache_read_input_tokens: 5000,
        cache_creation_input_tokens: 3200,
      }),
      reply([thinking, finalAnswer()], "end_turn", {
        input_tokens: 300,
        output_tokens: 600,
        cache_read_input_tokens: 8200,
      }),
    ]);
    const { log, lines } = logger();

    const outcome = expectOk(await runTriage(context(), backend(), options(client, { logger: log })));

    expect(outcome.result).toEqual(RESULT);
    expect(outcome.turns).toBe(3);
    expect(outcome.stopCause).toBe("complete");
    expect(outcome.modelUsed).toBe("claude-opus-5-5");
    expect(requests).toHaveLength(3);

    const first = requests[0];
    expect(first?.url).toMatch(/\/v1\/messages(\?beta=true)?$/);
    expect(first?.body).toMatchObject({
      model: "claude-opus-5-5",
      max_tokens: 16000,
      cache_control: { type: "ephemeral" },
      output_config: { effort: "high", format: { type: "json_schema" } },
      fallbacks: "default",
    });
    const system = first?.body.system as Array<{ type: string; text: string; cache_control: unknown }>;
    expect(system).toHaveLength(1);
    expect(system[0]?.cache_control).toEqual({ type: "ephemeral" });
    expect(system[0]?.text).toContain("senior CI/DevOps engineer");
    const tools = first?.body.tools as Array<{ name: string; input_schema: unknown; run?: unknown }>;
    expect(tools.map((tool) => tool.name)).toEqual([
      "search_log",
      "read_log",
      "read_file",
      "list_directory",
      "get_file_diff",
      "get_job_history",
    ]);
    expect(tools[0]).not.toHaveProperty("run");
    expect(first?.body.thinking).toEqual({ type: "adaptive" });
    for (const forbidden of ["temperature", "top_p", "top_k", "tool_choice", "thread", "max_iterations"]) {
      expect(first?.body).not.toHaveProperty(forbidden);
    }
    expect(first?.headers.get("anthropic-beta")).toContain("server-side-fallback-2026-07-01");
    const schema = (first?.body.output_config as { format: { schema: { required: string[] } } }).format
      .schema;
    expect(schema.required).toContain("root_cause");

    // The first user message is the rendered context.
    expect(first?.body.messages).toHaveLength(1);
    expect(JSON.stringify(first?.body.messages[0])).toContain("# Failed workflow run");

    // Turn 2 replays the assistant turn unchanged (thinking included) and answers the tool call.
    const second = requests[1]?.body.messages ?? [];
    expect(second).toHaveLength(3);
    expect(second[1]).toEqual({
      role: "assistant",
      content: [thinking, toolUse("toolu_1", "search_log", { job: "test", pattern: "Received", context: 1 })],
    });
    const results = second[2]?.content as Array<{
      type: string;
      tool_use_id: string;
      content: string;
      is_error?: boolean;
    }>;
    expect(results[0]).toMatchObject({ type: "tool_result", tool_use_id: "toolu_1" });
    expect(results[0]?.content).toContain("> 6 |   Received: 9");
    expect(results[0]?.is_error).toBeUndefined();
    expect(requests[2]?.body.messages).toHaveLength(5);

    // Usage and cost of all three responses, priced at Opus 5.5 rates.
    expect(outcome.usage).toMatchObject({
      requests: 3,
      inputTokens: 3700,
      outputTokens: 950,
      cacheReadTokens: 13200,
      cacheWriteTokens: 8200,
    });
    const expectedCost = (3700 * 4 + 950 * 20 + 13200 * 0.2 + 8200 * 5) / 1_000_000;
    expect(outcome.usage.costUsd).toBeCloseTo(expectedCost, 10);

    // One trace entry per tool call, stamped with the turn that asked for it.
    expect(outcome.trace).toEqual([
      expect.objectContaining({
        turn: 1,
        name: "search_log",
        input: { job: "test", pattern: "Received", context: 1 },
        ok: true,
      }),
      expect.objectContaining({
        turn: 2,
        name: "get_file_diff",
        input: { path: "src/discount.ts" },
        ok: true,
      }),
    ]);
    expect(outcome.trace[1]?.resultChars).toBeGreaterThan(0);
    expect(lines.info).toEqual(["Turn 1: search_log", "Turn 2: get_file_diff", "Turn 3: final answer"]);
    expect(lines.debug.some((line) => line.includes("cache_read=5000"))).toBe(true);
  });

  it("sends neither fallbacks nor the fallback beta to models without server-side fallback", async () => {
    const { client, requests } = scriptedClient([
      reply([finalAnswer()], "end_turn", undefined, { model: "claude-haiku-5-5" }),
    ]);

    const outcome = expectOk(
      await runTriage(context(), backend(), options(client, { model: "claude-haiku-5-5", effort: "low" })),
    );

    expect(outcome.modelUsed).toBe("claude-haiku-5-5");
    const body = requests[0]?.body;
    expect(body?.model).toBe("claude-haiku-5-5");
    expect(body).not.toHaveProperty("fallbacks");
    expect(requests[0]?.headers.get("anthropic-beta") ?? "").not.toContain("server-side-fallback");
    expect(body?.output_config).toMatchObject({ effort: "low" });
  });

  it("leaves effort out for models without effort control", async () => {
    const { client, requests } = scriptedClient([
      reply([finalAnswer()], "end_turn", undefined, { model: "claude-haiku-4-5" }),
    ]);

    expectOk(await runTriage(context(), backend(), options(client, { model: "claude-haiku-4-5" })));

    expect(requests[0]?.body.output_config).not.toHaveProperty("effort");
    expect(requests[0]?.body.output_config).toHaveProperty("format");
  });

  it("asks for the final answer once the cost budget is spent", async () => {
    const { client, requests } = scriptedClient([
      // 10k input tokens at $4/M = $0.04, over the $0.01 budget
      reply([toolUse("toolu_1", "get_file_diff", { path: "src/discount.ts" })], "tool_use", {
        input_tokens: 10_000,
        output_tokens: 10,
      }),
      reply([finalAnswer({ ...RESULT, confidence: "medium" })], "end_turn"),
    ]);
    const { log, lines } = logger();

    const outcome = expectOk(
      await runTriage(context(), backend(), options(client, { maxCostUsd: 0.01, logger: log })),
    );

    expect(outcome.stopCause).toBe("budget");
    expect(outcome.turns).toBe(2);
    expect(outcome.result.confidence).toBe("medium");
    expect(requests[0]?.body).not.toHaveProperty("tool_choice");
    const final = requests[1]?.body;
    expect(final?.tool_choice).toEqual({ type: "none" });
    // The pending call is still answered, then a system message asks for the answer.
    const messages = final?.messages ?? [];
    expect(messages.map((message) => message.role)).toEqual(["user", "assistant", "user", "system"]);
    expect(messages[2]?.content).toEqual([
      expect.objectContaining({
        type: "tool_result",
        tool_use_id: "toolu_1",
        content: expect.stringContaining("Math.round") as string,
      }),
    ]);
    expect(String(messages[3]?.content)).toContain("cost budget");
    expect(String(messages[3]?.content)).toContain("Do not call any more tools");
    expect(outcome.trace).toHaveLength(1);
    expect(lines.info).toContain(
      "The cost budget for this investigation is used up. Asking for the final answer.",
    );
  });

  it("puts the final instruction in the user turn for models without system messages", async () => {
    const sonnet5 = { model: "claude-sonnet-5" };
    const { client, requests } = scriptedClient([
      reply(
        [toolUse("toolu_1", "get_file_diff", { path: "src/discount.ts" })],
        "tool_use",
        { input_tokens: 10_000, output_tokens: 10 },
        sonnet5,
      ),
      reply([finalAnswer()], "end_turn", undefined, sonnet5),
    ]);

    const outcome = expectOk(
      await runTriage(context(), backend(), options(client, { model: "claude-sonnet-5", maxCostUsd: 0.001 })),
    );

    expect(outcome.stopCause).toBe("budget");
    const messages = requests[1]?.body.messages ?? [];
    expect(messages.map((message) => message.role)).toEqual(["user", "assistant", "user"]);
    const content = messages[2]?.content as Array<{ type: string; text?: string }>;
    expect(content.map((block) => block.type)).toEqual(["tool_result", "text"]);
    expect(content[1]?.text).toContain("Do not call any more tools");
    expect(requests[0]?.body).not.toHaveProperty("fallbacks");
  });

  it("makes the last allowed turn a final one at max_turns", async () => {
    const { client, requests } = scriptedClient([
      reply([toolUse("toolu_1", "search_log", { job: "test", pattern: "FAIL" })], "tool_use"),
      reply([toolUse("toolu_2", "read_log", { job: "test", start_line: 1, end_line: 7 })], "tool_use"),
      reply([finalAnswer()], "end_turn"),
    ]);

    const outcome = expectOk(await runTriage(context(), backend(), options(client, { maxTurns: 3 })));

    expect(outcome.stopCause).toBe("max_turns");
    expect(outcome.turns).toBe(3);
    expect(requests[1]?.body).not.toHaveProperty("tool_choice");
    expect(requests[2]?.body.tool_choice).toEqual({ type: "none" });
    expect(String(lastMessage(requests[2]).content)).toContain("turn limit");
    expect(outcome.trace.map((call) => [call.turn, call.name])).toEqual([
      [1, "search_log"],
      [2, "read_log"],
    ]);
  });

  it("asks for the final answer when most of the time budget is gone", async () => {
    const slow = () =>
      new Promise<Response>((resolve) =>
        setTimeout(
          () =>
            resolve(reply([toolUse("toolu_1", "get_file_diff", { path: "src/discount.ts" })], "tool_use")),
          850,
        ),
      );
    const { client, requests } = scriptedClient([slow, reply([finalAnswer()], "end_turn")]);

    const outcome = expectOk(await runTriage(context(), backend(), options(client, { timeoutMs: 1000 })));

    expect(outcome.stopCause).toBe("timeout");
    expect(requests[1]?.body.tool_choice).toEqual({ type: "none" });
    expect(String(lastMessage(requests[1]).content)).toContain("time limit");
  });

  it("aborts at the hard deadline and reports an error", async () => {
    const hang = (signal: AbortSignal | undefined) =>
      new Promise<Response>((_, reject) => {
        signal?.addEventListener("abort", () =>
          reject(new DOMException("The operation was aborted.", "AbortError")),
        );
      });
    const { client } = scriptedClient([hang]);

    const outcome = await runTriage(context(), backend(), options(client, { timeoutMs: 100 }));

    expect(outcome).toMatchObject({ status: "error", turns: 0, message: "the agent timed out after 0s" });
  });

  it("returns a refused outcome when the model declines", async () => {
    const { client, requests } = scriptedClient([
      reply(
        [],
        "refusal",
        { input_tokens: 2000, output_tokens: 0 },
        {
          stop_details: {
            type: "refusal",
            category: "cyber",
            explanation: "Request touches exploit development.",
          },
        },
      ),
    ]);

    const outcome = await runTriage(context(), backend(), options(client));

    expect(outcome).toMatchObject({
      status: "refused",
      turns: 1,
      message: "Claude declined to triage this run (cyber): Request touches exploit development.",
    });
    expect(outcome.usage.requests).toBe(1);
    expect(outcome.usage.inputTokens).toBe(2000);
    expect(requests).toHaveLength(1);
  });

  it("repairs an invalid final answer with one more request", async () => {
    const { client, requests } = scriptedClient([
      reply([{ type: "text", text: "The discount test fails because of rounding." }], "end_turn"),
      reply([finalAnswer()], "end_turn"),
    ]);
    const { log, lines } = logger();

    const outcome = expectOk(await runTriage(context(), backend(), options(client, { logger: log })));

    expect(outcome.result).toEqual(RESULT);
    expect(outcome.turns).toBe(2);
    expect(outcome.stopCause).toBe("complete");
    expect(requests[1]?.body.tool_choice).toEqual({ type: "none" });
    const messages = requests[1]?.body.messages ?? [];
    expect(messages.map((message) => message.role)).toEqual(["user", "assistant", "user"]);
    expect(JSON.stringify(messages[2]?.content)).toContain("Reply with only the JSON object");
    expect(lines.warning).toHaveLength(1);
  });

  it("gives up when the repaired answer is still invalid", async () => {
    const { client, requests } = scriptedClient([
      reply([{ type: "text", text: "not json" }], "end_turn"),
      reply([{ type: "text", text: JSON.stringify({ ...RESULT, category: "weather" }) }], "end_turn"),
    ]);

    const outcome = await runTriage(context(), backend(), options(client));

    expect(outcome).toMatchObject({
      status: "error",
      turns: 2,
      message: "the final answer was not a valid triage JSON object, even after a repair request",
    });
    expect(requests).toHaveLength(2);
  });

  it("never runs a tool call cut off at max_tokens and lets the agent retry it", async () => {
    const readFile = vi.fn(async () => "export const x = 1;\n");
    const { client, requests } = scriptedClient([
      reply([toolUse("toolu_9", "read_file", { path: "src/discount.ts" })], "max_tokens"),
      reply([finalAnswer()], "end_turn"),
    ]);

    const outcome = expectOk(await runTriage(context(), backend({ readFile }), options(client)));

    expect(readFile).not.toHaveBeenCalled();
    const content = lastMessage(requests[1]).content as Array<{
      type: string;
      tool_use_id?: string;
      is_error?: boolean;
    }>;
    expect(content).toEqual([
      expect.objectContaining({ type: "tool_result", tool_use_id: "toolu_9", is_error: true }),
    ]);
    expect(requests[1]?.body.tool_choice).toBeUndefined();
    expect(outcome.stopCause).toBe("complete");
  });

  it("reports a failing tool to the model as an error result and keeps going", async () => {
    const { client, requests } = scriptedClient([
      reply([toolUse("toolu_1", "read_file", { path: "src/discount.ts" })], "tool_use"),
      reply([finalAnswer()], "end_turn"),
    ]);
    const failing = backend({
      readFile: async () => {
        throw new Error("GitHub API returned 502");
      },
    });

    const outcome = expectOk(await runTriage(context(), failing, options(client)));

    const results = lastMessage(requests[1]).content as Array<{ is_error?: boolean; content: string }>;
    expect(results[0]).toMatchObject({
      is_error: true,
      content: "Error: read_file failed: GitHub API returned 502",
    });
    expect(outcome.trace).toEqual([expect.objectContaining({ turn: 1, name: "read_file", ok: false })]);
  });

  it("turns a rejected API key into an error outcome without echoing the key", async () => {
    const { client } = scriptedClient([
      jsonResponse(
        { type: "error", error: { type: "authentication_error", message: "invalid x-api-key: sk-test" } },
        401,
      ),
    ]);

    const outcome = await runTriage(context(), backend(), options(client, { apiKey: "sk-test" }));

    expect(outcome.status).toBe("error");
    if (outcome.status !== "error") return;
    expect(outcome.message).toBe("Anthropic API key rejected (401); check the API key secret");
    expect(outcome.message).not.toContain("sk-test");
    expect(outcome.turns).toBe(0);
    expect(outcome.usage.requests).toBe(0);
  });

  it("scrubs anything that looks like an API key from other API errors", async () => {
    const leaked = "sk-ant-api03-EXAMPLEEXAMPLEEXAMPLE";
    const { client } = scriptedClient([
      jsonResponse(
        { type: "error", error: { type: "invalid_request_error", message: `bad header near ${leaked}` } },
        400,
      ),
    ]);

    const outcome = await runTriage(context(), backend(), options(client));

    expect(outcome).toMatchObject({
      status: "error",
      message: "Anthropic API rejected the request (400): bad header near [REDACTED]",
    });
  });

  it("starts with a tool-less request when only one turn is allowed", async () => {
    const { client, requests } = scriptedClient([reply([finalAnswer()], "end_turn")]);

    const outcome = expectOk(await runTriage(context(), backend(), options(client, { maxTurns: 1 })));

    expect(outcome.stopCause).toBe("max_turns");
    expect(requests[0]?.body.tool_choice).toEqual({ type: "none" });
    expect(JSON.stringify(requests[0]?.body.messages[0]?.content)).toContain("Do not call any more tools");
  });

  it("appends the workflow author's notes to the system prompt", async () => {
    const { client, requests } = scriptedClient([reply([finalAnswer()], "end_turn")]);

    expectOk(
      await runTriage(
        context(),
        backend(),
        options(client, { extraInstructions: "Snapshot tests live in __snapshots__." }),
      ),
    );

    const system = requests[0]?.body.system as Array<{ text: string }>;
    expect(system[0]?.text).toMatch(
      /# Repository notes from the workflow author\nSnapshot tests live in __snapshots__\.$/,
    );
  });
});

describe("effortFor", () => {
  it("passes supported levels through and steps down where a model tops out lower", () => {
    expect(effortFor("claude-opus-5-5", "xhigh")).toBe("xhigh");
    expect(effortFor("claude-fable-5-2", "max")).toBe("max");
    expect(effortFor("claude-sonnet-4-6", "xhigh")).toBe("high");
    expect(effortFor("claude-opus-4-5", "max")).toBe("high");
    expect(effortFor("us.anthropic.claude-sonnet-5-5", "low")).toBe("low");
  });

  it("returns null for models without effort control", () => {
    expect(effortFor("claude-haiku-4-5", "high")).toBeNull();
    expect(effortFor("claude-sonnet-4-5", "medium")).toBeNull();
  });
});

describe("runTriage edge cases", () => {
  const LONE_SURROGATE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;

  it("answers at the hard deadline even when a tool call never returns", async () => {
    const { client, requests } = scriptedClient([
      reply([toolUse("toolu_1", "read_file", { path: "src/discount.ts" })], "tool_use"),
    ]);
    const stuck = backend({ readFile: () => new Promise<string | null>(() => undefined) });

    const started = Date.now();
    const outcome = await runTriage(context(), stuck, options(client, { timeoutMs: 150 }));

    expect(Date.now() - started).toBeLessThan(2000);
    expect(outcome).toMatchObject({ status: "error", turns: 1, message: "the agent timed out after 0s" });
    expect(outcome.usage.requests).toBe(1);
    expect(requests).toHaveLength(1);
  });

  it("prices a response by the model that served it and reports it as the model used", async () => {
    const { client } = scriptedClient([
      reply(
        [finalAnswer()],
        "end_turn",
        { input_tokens: 1_000_000, output_tokens: 0 },
        { model: "claude-opus-4-8" },
      ),
    ]);

    const outcome = expectOk(await runTriage(context(), backend(), options(client)));

    expect(outcome.modelUsed).toBe("claude-opus-4-8");
    expect(outcome.usage.costUsd).toBeCloseTo(5, 10);
  });

  it("keeps investigating without a cost budget when the model has no known price", async () => {
    const custom = { model: "claude-custom-preview" };
    const { client, requests } = scriptedClient([
      reply(
        [toolUse("toolu_1", "get_file_diff", { path: "src/discount.ts" })],
        "tool_use",
        { input_tokens: 10_000_000, output_tokens: 10 },
        custom,
      ),
      reply(
        [toolUse("toolu_2", "get_file_diff", { path: "src/discount.ts" })],
        "tool_use",
        undefined,
        custom,
      ),
      reply([finalAnswer()], "end_turn", undefined, custom),
    ]);
    const { log, lines } = logger();

    const outcome = expectOk(
      await runTriage(
        context(),
        backend(),
        options(client, { model: "claude-custom-preview", maxCostUsd: 0.01, logger: log }),
      ),
    );

    expect(outcome.stopCause).toBe("complete");
    expect(outcome.usage.costUsd).toBeNull();
    expect(requests.map((request) => request.body.tool_choice)).toEqual([undefined, undefined, undefined]);
    expect(lines.warning).toContain(
      "No price is known for claude-custom-preview; the cost budget cannot be enforced.",
    );
  });

  it("repairs an invalid answer to a budget-forced final request and keeps the budget stop cause", async () => {
    const { client, requests } = scriptedClient([
      reply([toolUse("toolu_1", "get_file_diff", { path: "src/discount.ts" })], "tool_use", {
        input_tokens: 10_000,
        output_tokens: 10,
      }),
      reply([{ type: "text", text: "Rounding broke it." }], "end_turn"),
      reply([finalAnswer()], "end_turn"),
    ]);

    const outcome = expectOk(await runTriage(context(), backend(), options(client, { maxCostUsd: 0.01 })));

    expect(outcome.stopCause).toBe("budget");
    expect(outcome.turns).toBe(3);
    expect(requests.map((request) => request.body.tool_choice)).toEqual([
      undefined,
      { type: "none" },
      { type: "none" },
    ]);
    // Append-only history: the earlier system instruction stays, followed by the reply and the repair request.
    expect(requests[2]?.body.messages.map((message) => message.role)).toEqual([
      "user",
      "assistant",
      "user",
      "system",
      "assistant",
      "user",
    ]);
  });

  it("finalizes after the first tool turn when only two turns are allowed", async () => {
    const { client, requests } = scriptedClient([
      reply([toolUse("toolu_1", "search_log", { job: "test", pattern: "FAIL" })], "tool_use"),
      reply([finalAnswer()], "end_turn"),
    ]);

    const outcome = expectOk(await runTriage(context(), backend(), options(client, { maxTurns: 2 })));

    expect(outcome.stopCause).toBe("max_turns");
    expect(requests[1]?.body.tool_choice).toEqual({ type: "none" });
    expect(outcome.trace).toHaveLength(1);
  });

  it("resumes a paused turn and still counts and prices it", async () => {
    const { client, requests } = scriptedClient([
      reply([thinking], "pause_turn"),
      reply([finalAnswer()], "end_turn"),
    ]);

    const outcome = expectOk(await runTriage(context(), backend(), options(client)));

    expect(outcome.turns).toBe(2);
    expect(outcome.usage.requests).toBe(2);
    expect(requests[1]?.body.messages.map((message) => message.role)).toEqual(["user", "assistant"]);
  });

  it.each([
    [
      "a rate limit",
      () => jsonResponse({ type: "error", error: { type: "rate_limit_error", message: "slow down" } }, 429),
      "Anthropic API rate or spend limit reached (429), even after retries: slow down",
    ],
    [
      "a server error",
      () =>
        jsonResponse({ type: "error", error: { type: "api_error", message: "Internal server error" } }, 500),
      "Anthropic API error 500: Internal server error",
    ],
    [
      "a permission error",
      () =>
        jsonResponse(
          { type: "error", error: { type: "permission_error", message: "model not enabled for this key" } },
          403,
        ),
      "Anthropic API permission denied (403): model not enabled for this key",
    ],
    [
      "an unreachable API",
      () => Promise.reject(new TypeError("fetch failed")),
      "could not reach the Anthropic API: Connection error.",
    ],
  ])("maps %s to an error outcome", async (_, respond, message) => {
    const { client } = scriptedClient([() => respond() as Promise<Response>]);

    const outcome = await runTriage(context(), backend(), options(client));

    expect(outcome).toMatchObject({ status: "error", turns: 0, message });
  });

  it("never sends a lone surrogate, even when a clipped log line ends in an emoji", async () => {
    const ctx = context();
    const excerpt = ctx.failedJobs[0]?.excerpt;
    const line = excerpt?.ranges[0]?.lines[5];
    if (!line) throw new Error("fixture changed");
    // 499 + a 2-unit emoji straddles the 500-character clip.
    line.text = `${"x".repeat(499)}\u{1F680} after`;
    const { client, requests } = scriptedClient([reply([finalAnswer()], "end_turn")]);

    expectOk(await runTriage(ctx, backend(), options(client)));

    expect(LONE_SURROGATE.test(JSON.stringify(requests[0]?.body.messages))).toBe(false);
    expect(String(requests[0]?.body.messages[0]?.content)).toContain(`${"x".repeat(499)} [... `);
  });
});

describe("model controls from review", () => {
  it.each([
    ["claude-opus-4-8", { type: "adaptive" }],
    ["claude-sonnet-4-6", { type: "adaptive" }],
    ["claude-haiku-5-5", { type: "adaptive" }],
    ["claude-haiku-4-5", undefined],
  ])("sends the right thinking config for %s", async (model, expected) => {
    const { client, requests } = scriptedClient([reply([finalAnswer()], "end_turn", undefined, { model })]);

    expectOk(await runTriage(context(), backend(), options(client, { model })));

    expect(requests[0]?.body.thinking).toEqual(expected);
  });

  it("warns when the model has no effort control", async () => {
    const { client } = scriptedClient([
      reply([finalAnswer()], "end_turn", undefined, { model: "claude-haiku-4-5" }),
    ]);
    const { log, lines } = logger();

    expectOk(
      await runTriage(context(), backend(), options(client, { model: "claude-haiku-4-5", logger: log })),
    );

    expect(lines.warning.join("\n")).toContain("no effort control");
  });
});

describe("budget guards from the security review", () => {
  it("retries a truncated tool call once, then forces the final answer", async () => {
    const readFile = vi.fn(async () => "x\n");
    const { client, requests } = scriptedClient([
      reply([toolUse("toolu_1", "read_file", { path: "a.ts" })], "max_tokens"),
      reply([toolUse("toolu_2", "read_file", { path: "a.ts" })], "max_tokens"),
      reply([finalAnswer()], "end_turn"),
    ]);

    const outcome = expectOk(await runTriage(context(), backend({ readFile }), options(client)));

    expect(readFile).not.toHaveBeenCalled();
    expect(requests).toHaveLength(3);
    expect(requests[1]?.body.tool_choice).toBeUndefined();
    expect(requests[2]?.body.tool_choice).toEqual({ type: "none" });
    expect(outcome.stopCause).toBe("max_turns");
  });

  it("checks the cost budget before retrying a truncated tool call", async () => {
    const { client, requests } = scriptedClient([
      reply([toolUse("toolu_1", "read_file", { path: "a.ts" })], "max_tokens", {
        input_tokens: 10_000,
        output_tokens: 16_000,
      }),
      reply([finalAnswer()], "end_turn"),
    ]);

    const outcome = expectOk(await runTriage(context(), backend(), options(client, { maxCostUsd: 0.01 })));

    expect(requests[1]?.body.tool_choice).toEqual({ type: "none" });
    expect(outcome.stopCause).toBe("budget");
  });

  it("runs at most MAX_TOOL_CALLS_PER_TURN tool calls from one turn", async () => {
    const readFile = vi.fn(async () => "x\n");
    const calls = Array.from({ length: MAX_TOOL_CALLS_PER_TURN + 4 }, (_, i) =>
      toolUse(`toolu_${i}`, "read_file", { path: `f${i}.ts` }),
    );
    const { client, requests } = scriptedClient([
      reply(calls, "tool_use"),
      reply([finalAnswer()], "end_turn"),
    ]);

    expectOk(await runTriage(context(), backend({ readFile }), options(client)));

    expect(readFile).toHaveBeenCalledTimes(MAX_TOOL_CALLS_PER_TURN);
    const results = lastMessage(requests[1]).content as Array<{ is_error?: boolean; content: unknown }>;
    expect(results).toHaveLength(MAX_TOOL_CALLS_PER_TURN + 4);
    expect(results.filter((r) => r.is_error)).toHaveLength(4);
  });
});

describe("proxyOptions", () => {
  it("adds a proxy-aware fetch only when a proxy is configured", async () => {
    const { proxyOptions } = await import("../src/agent/agent.js");
    expect(proxyOptions({})).toEqual({});
    const opts = proxyOptions({ HTTPS_PROXY: "http://proxy.internal.example:3128" });
    expect(typeof opts.fetch).toBe("function");
    expect(opts.fetchOptions).toHaveProperty("dispatcher");
  });
});
