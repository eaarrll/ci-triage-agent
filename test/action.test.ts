// End-to-end test of the action's control flow. Real config parsing, redaction, context building,
// signatures and report rendering; only GitHub, the Actions toolkit and the Claude call are faked.
import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  CommentPort,
  JobInfo,
  RunInfo,
  TriageBackend,
  TriageOutcome,
  TriageResult,
} from "../src/types.js";

const state = vi.hoisted(() => ({
  inputs: {} as Record<string, string>,
  outputs: {} as Record<string, string>,
  failed: [] as string[],
  warnings: [] as string[],
  secrets: [] as string[],
  summary: "",
  context: {
    repo: { owner: "example-org", repo: "shop-api" },
    runId: 555,
    eventName: "workflow_run",
    payload: { workflow_run: { id: 7001 } } as Record<string, unknown>,
  },
}));

vi.mock("@actions/core", () => ({
  getInput: (name: string) => state.inputs[name] ?? "",
  setOutput: (name: string, value: string) => {
    state.outputs[name] = value;
  },
  setFailed: (msg: string) => {
    state.failed.push(msg);
  },
  setSecret: (s: string) => {
    state.secrets.push(s);
  },
  warning: (msg: string) => {
    state.warnings.push(msg);
  },
  info: () => {},
  debug: () => {},
  summary: {
    addRaw(text: string) {
      state.summary += text;
      return this;
    },
    async write() {
      return this;
    },
  },
}));

vi.mock("@actions/github", () => ({
  context: state.context,
  getOctokit: () => ({}),
}));

const backendHolder = vi.hoisted(() => ({ current: null as unknown }));
vi.mock("../src/github/gateway.js", () => ({
  createGitHubBackend: () => backendHolder.current,
}));

const runTriage = vi.hoisted(() => vi.fn());
vi.mock("../src/agent/agent.js", () => ({ runTriage }));

const { run } = await import("../src/action.js");

const SHA = "3f2a9c1e5b7d4f6a8c0e2b4d6f8a1c3e5b7d9f0a";
const FAKE_TOKEN = ["ghp", "_", "Zx9Yw8Vu7Ts6Rq5Po4Nm3Lk2Ji1Hg0FeDcBa98"].join("");

function runInfo(overrides: Partial<RunInfo> = {}): RunInfo {
  return {
    id: 7001,
    attempt: 1,
    workflowId: 42,
    workflowName: "CI",
    workflowPath: ".github/workflows/ci.yml",
    event: "pull_request",
    headBranch: "feature/discounts",
    headSha: SHA,
    headRepoFullName: "example-org/shop-api",
    isFork: false,
    defaultBranch: "main",
    conclusion: "failure",
    htmlUrl: "https://github.com/example-org/shop-api/actions/runs/7001",
    displayTitle: "Round discounts after subtracting",
    pullRequestNumbers: [12],
    createdAt: "2026-11-20T09:14:00Z",
    ...overrides,
  };
}

const JOB: JobInfo = {
  id: 301,
  name: "test",
  status: "completed",
  conclusion: "failure",
  startedAt: "2026-11-20T09:14:00Z",
  completedAt: "2026-11-20T09:15:00Z",
  runnerLabels: ["ubuntu-latest"],
  htmlUrl: null,
  steps: [
    {
      number: 1,
      name: "Set up job",
      status: "completed",
      conclusion: "success",
      startedAt: "2026-11-20T09:14:00Z",
      completedAt: "2026-11-20T09:14:02Z",
    },
    {
      number: 2,
      name: "Run npm test",
      status: "completed",
      conclusion: "failure",
      startedAt: "2026-11-20T09:14:03Z",
      completedAt: "2026-11-20T09:14:59Z",
    },
  ],
};

const LOG = [
  "2026-11-20T09:14:01.0000000Z Current runner version: '2.329.0'",
  "2026-11-20T09:14:04.0000000Z ##[group]Run npm test",
  `2026-11-20T09:14:04.1000000Z export GH_TOKEN=${FAKE_TOKEN}`,
  "2026-11-20T09:14:10.0000000Z  FAIL  test/discount.test.ts > applies 10% at exactly the threshold",
  "2026-11-20T09:14:10.1000000Z AssertionError: expected 100 to be 90",
  "2026-11-20T09:14:58.0000000Z ##[error]Process completed with exit code 1.",
].join("\n");

interface FakeBackend extends TriageBackend, CommentPort {
  upserts: Array<{ pr: number; marker: string; body: string }>;
}

function fakeBackend(
  run: RunInfo,
  opts: {
    existingComment?: string;
    pr?: number | null;
    failGetRun?: boolean;
    failUpsert?: boolean;
    jobs?: JobInfo[];
  } = {},
) {
  const backend: FakeBackend = {
    repo: { owner: "example-org", repo: "shop-api" },
    upserts: [],
    getRun: async () => {
      if (opts.failGetRun) throw new Error("HttpError: Bad credentials");
      return run;
    },
    listJobs: async () => opts.jobs ?? [JOB],
    getJobLog: async () => LOG,
    readFile: async () => null,
    listDirectory: async () => null,
    getChangedFiles: async () => [],
    getJobHistory: async () => [],
    findPullRequest: async () => (opts.pr === undefined ? 12 : opts.pr),
    findComment: async (_pr, marker) =>
      opts.existingComment === undefined
        ? null
        : { id: 9, body: `${marker}\n${opts.existingComment}`, htmlUrl: "https://github.com/c/9" },
    async upsertComment(pr, marker, body) {
      if (opts.failUpsert) throw new Error("Resource not accessible by integration");
      backend.upserts.push({ pr, marker, body });
      return {
        id: 9,
        htmlUrl: "https://github.com/example-org/shop-api/pull/12#issuecomment-9",
        created: true,
      };
    },
  };
  backendHolder.current = backend;
  return backend;
}

const RESULT: TriageResult = {
  category: "code",
  title: "applyDiscount skips the discount for orders of exactly 100.00",
  root_cause: "The PR changed the threshold check, so exactly-100 orders lose the discount.",
  evidence: [{ job: "test", line: 4, excerpt: "AssertionError: expected 100 to be 90" }],
  suggested_fix: "Restore `>=` in `applyDiscount`.",
  fix_location: { path: "src/pricing/discount.ts", line: 12 },
  confidence: "high",
  flaky_suspected: false,
  rerun_recommended: false,
};

const USAGE = {
  requests: 2,
  inputTokens: 1200,
  outputTokens: 300,
  cacheReadTokens: 5000,
  cacheWriteTokens: 4000,
  costUsd: 0.0412,
};

function okOutcome(): TriageOutcome {
  return {
    status: "ok",
    result: RESULT,
    usage: USAGE,
    trace: [],
    turns: 2,
    stopCause: "complete",
    modelUsed: "claude-opus-5-5",
  };
}

beforeEach(() => {
  state.inputs = { "github-token": "gh-token", "anthropic-api-key": "sk-ant-test-key" };
  state.outputs = {};
  state.failed = [];
  state.warnings = [];
  state.secrets = [];
  state.summary = "";
  runTriage.mockReset();
});

describe("action", () => {
  it("triages a failed run with the agent, comments on the PR and sets outputs", async () => {
    const backend = fakeBackend(runInfo());
    runTriage.mockResolvedValue(okOutcome());

    await run();

    expect(state.failed).toEqual([]);
    expect(runTriage).toHaveBeenCalledOnce();
    const [ctx, , opts] = runTriage.mock.calls[0]!;
    expect(ctx.failedJobs.map((j: { job: JobInfo }) => j.job.name)).toEqual(["test"]);
    expect(opts).toMatchObject({ model: "claude-opus-5-5", effort: "medium", apiKey: "sk-ant-test-key" });
    expect(state.secrets).toContain("sk-ant-test-key");

    expect(backend.upserts).toHaveLength(1);
    expect(backend.upserts[0]!.pr).toBe(12);
    expect(backend.upserts[0]!.body.startsWith(backend.upserts[0]!.marker)).toBe(true);
    expect(backend.upserts[0]!.body).toContain(RESULT.title);

    expect(state.outputs).toMatchObject({
      mode: "agent",
      category: "code",
      confidence: "high",
      "flaky-suspected": "false",
      "cost-usd": "0.0412",
    });
    expect(JSON.parse(state.outputs["result-json"]!)).toEqual(RESULT);
    expect(state.summary).toContain(RESULT.title);
  });

  it("never lets a secret from the log reach the agent", async () => {
    fakeBackend(runInfo());
    runTriage.mockResolvedValue(okOutcome());

    await run();

    const [ctx, backend] = runTriage.mock.calls[0]!;
    expect(JSON.stringify(ctx)).not.toContain(FAKE_TOKEN);
    expect(await backend.getJobLog(JOB.id)).not.toContain(FAKE_TOKEN);
  });

  it("falls back to heuristic triage when the agent fails, and still comments", async () => {
    const backend = fakeBackend(runInfo());
    runTriage.mockResolvedValue({
      status: "error",
      usage: USAGE,
      trace: [],
      turns: 1,
      message: "Anthropic API key rejected",
    });

    await run();

    expect(state.failed).toEqual([]);
    expect(state.outputs.mode).toBe("heuristic");
    expect(state.warnings.join("\n")).toContain("Falling back to heuristic triage");
    expect(backend.upserts).toHaveLength(1);
    expect(backend.upserts[0]!.body).toContain("heuristic");
  });

  it("uses heuristic mode without calling Claude when no API key is set", async () => {
    const backend = fakeBackend(runInfo());
    state.inputs["anthropic-api-key"] = "";

    await run();

    expect(runTriage).not.toHaveBeenCalled();
    expect(state.outputs.mode).toBe("heuristic");
    expect(backend.upserts).toHaveLength(1);
  });

  it("marks the earlier comment resolved when the workflow passes again", async () => {
    const backend = fakeBackend(runInfo({ conclusion: "success" }), {
      existingComment: "### 🧑‍💻 CI triage: old failure",
    });

    await run();

    expect(runTriage).not.toHaveBeenCalled();
    expect(state.outputs.mode).toBe("resolved");
    expect(backend.upserts).toHaveLength(1);
    expect(backend.upserts[0]!.body).toContain("Resolved");
  });

  it("skips cancelled runs", async () => {
    const backend = fakeBackend(runInfo({ conclusion: "cancelled" }));

    await run();

    expect(state.outputs.mode).toBe("skipped");
    expect(runTriage).not.toHaveBeenCalled();
    expect(backend.upserts).toHaveLength(0);
  });

  it("writes only the job summary when the run has no open PR", async () => {
    const backend = fakeBackend(runInfo({ pullRequestNumbers: [] }), { pr: null });
    runTriage.mockResolvedValue(okOutcome());

    await run();

    expect(backend.upserts).toHaveLength(0);
    expect(state.outputs["comment-url"]).toBe("");
    expect(state.summary).toContain(RESULT.title);
  });

  it("fails open on runtime errors", async () => {
    fakeBackend(runInfo(), { failGetRun: true });

    await run();

    expect(state.failed).toEqual([]);
    expect(state.warnings.join("\n")).toContain("Bad credentials");
    expect(state.outputs.mode).toBe("error");
  });

  it("fails the step on runtime errors when fail-on-error is set", async () => {
    fakeBackend(runInfo(), { failGetRun: true });
    state.inputs["fail-on-error"] = "true";

    await run();

    expect(state.failed.join("\n")).toContain("Bad credentials");
  });

  it("fails loudly on invalid inputs", async () => {
    fakeBackend(runInfo());
    state.inputs.effort = "extreme";

    await run();

    expect(state.failed).toHaveLength(1);
    expect(state.failed[0]).toContain("effort");
    expect(state.failed[0]).not.toContain("sk-ant-test-key");
  });
});

describe("action: review fixes", () => {
  it("keeps every result output when the comment cannot be posted (read-only fork token)", async () => {
    fakeBackend(runInfo(), { failUpsert: true });
    runTriage.mockResolvedValue(okOutcome());
    state.inputs["fail-on-error"] = "true";

    await run();

    expect(state.failed).toEqual([]);
    expect(state.outputs).toMatchObject({ mode: "agent", category: "code", "comment-url": "" });
    expect(state.outputs["result-json"]).toBeTruthy();
    expect(state.warnings.join("\n")).toContain("Could not post the PR comment");
  });

  it("does not overwrite a comment written by a newer run", async () => {
    const backend = fakeBackend(runInfo({ id: 7001 }), {
      existingComment: "<!-- ci-triage-agent:run=7010.1 -->\n### ✅ Resolved: CI passed on abcdef0",
    });
    runTriage.mockResolvedValue(okOutcome());

    await run();

    expect(backend.upserts).toHaveLength(0);
    expect(state.outputs.mode).toBe("agent");
  });

  it("updates a comment written by an older run", async () => {
    const backend = fakeBackend(runInfo({ id: 7001 }), {
      existingComment: "<!-- ci-triage-agent:run=6990.1 -->\n### 🧑‍💻 CI triage: old",
    });
    runTriage.mockResolvedValue(okOutcome());

    await run();

    expect(backend.upserts).toHaveLength(1);
    expect(backend.upserts[0]!.body).toContain("<!-- ci-triage-agent:run=7001.1 -->");
  });

  it("resolves from inside the workflow when no job has failed (same-workflow mode)", async () => {
    const passed: JobInfo = {
      ...JOB,
      conclusion: "success",
      steps: JOB.steps.map((st) => ({ ...st, conclusion: "success" })),
    };
    const backend = fakeBackend(runInfo({ conclusion: null }), {
      jobs: [passed],
      existingComment: "<!-- ci-triage-agent:run=6990.1 -->\n### 🧑‍💻 CI triage: old failure",
    });

    await run();

    expect(state.outputs.mode).toBe("resolved");
    expect(backend.upserts[0]!.body).toContain("Resolved");
  });

  it("reports skipped, not resolved, when there was nothing to resolve", async () => {
    fakeBackend(runInfo({ conclusion: "success" }));

    await run();

    expect(state.outputs.mode).toBe("skipped");
  });

  it("sets mode=error on invalid inputs", async () => {
    fakeBackend(runInfo());
    state.inputs["max-turns"] = "lots";

    await run();

    expect(state.outputs.mode).toBe("error");
  });
});
