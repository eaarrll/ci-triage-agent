import { setTimeout as delay } from "node:timers/promises";
import { describe, expect, it } from "vitest";
import { buildContext, selectFailedJobs } from "../src/context.js";
import type {
  AgentLogger,
  ChangedFile,
  JobHistoryEntry,
  JobInfo,
  RepoRef,
  RunInfo,
  StepInfo,
  TriageBackend,
} from "../src/types.js";

const BASE_MS = Date.UTC(2026, 2, 2, 10, 0, 0);

function time(offset: number): string {
  return new Date(BASE_MS + offset * 1000).toISOString().replace(".000Z", "Z");
}

function ts(offset: number): string {
  return new Date(BASE_MS + Math.round(offset * 1000)).toISOString().replace("Z", "0000Z");
}

const RUN: RunInfo = {
  id: 9001,
  attempt: 1,
  workflowId: 42,
  workflowName: "CI",
  workflowPath: ".github/workflows/ci.yml",
  event: "pull_request",
  headBranch: "feature/discounts",
  headSha: "0123456789abcdef0123456789abcdef01234567",
  headRepoFullName: "example-org/webapp",
  isFork: false,
  defaultBranch: "main",
  conclusion: "failure",
  htmlUrl: "https://github.com/example-org/webapp/actions/runs/9001",
  displayTitle: "Round discounts after subtracting",
  pullRequestNumbers: [12],
  createdAt: time(0),
};

function step(number: number, name: string, conclusion: string | null, start: number, end: number): StepInfo {
  return { number, name, status: "completed", conclusion, startedAt: time(start), completedAt: time(end) };
}

/** A job that ran steps 0-60s and finished `completedOffset` seconds after 10:00:00. */
function job(id: number, name: string, conclusion: string, completedOffset = 60): JobInfo {
  const failed = conclusion === "success" ? "success" : conclusion === "cancelled" ? "cancelled" : "failure";
  return {
    id,
    name,
    status: "completed",
    conclusion,
    startedAt: time(0),
    completedAt: time(completedOffset),
    runnerLabels: ["ubuntu-latest"],
    htmlUrl: `https://github.com/example-org/webapp/actions/runs/9001/job/${id}`,
    steps: [
      step(1, "Set up job", "success", 0, 2),
      step(2, "Run tests", failed, 3, 50),
      step(3, "Cleanup", conclusion === "success" ? "success" : null, 51, 59),
      step(4, "Complete job", "success", 59, 60),
    ],
  };
}

function failingLog(error: string): string {
  return (
    [
      `${ts(0.5)} Current runner version: '2.321.0'`,
      `${ts(3.5)} ##[group]Run npm test`,
      `${ts(3.5)} npm test`,
      `${ts(3.5)} ##[endgroup]`,
      `${ts(10)} ${error}`,
      `${ts(49)} ##[error]Process completed with exit code 1.`,
      `${ts(59.5)} Cleaning up orphan processes`,
    ].join("\n") + "\n"
  );
}

const CHANGED: ChangedFile[] = [
  {
    path: "src/cart.ts",
    status: "modified",
    additions: 3,
    deletions: 1,
    patch: "@@ -10,3 +10,5 @@",
    previousPath: null,
  },
];

class FakeBackend implements TriageBackend {
  readonly repo: RepoRef = { owner: "example-org", repo: "webapp" };
  readonly logRequests: number[] = [];
  inFlight = 0;
  maxInFlight = 0;

  constructor(
    private readonly jobs: JobInfo[],
    private readonly logs: Record<number, string | Error>,
    private readonly changed: ChangedFile[] | Error = CHANGED,
  ) {}

  async getRun(): Promise<RunInfo> {
    return RUN;
  }

  async listJobs(): Promise<JobInfo[]> {
    return this.jobs;
  }

  async getJobLog(jobId: number): Promise<string> {
    this.logRequests.push(jobId);
    this.inFlight++;
    this.maxInFlight = Math.max(this.maxInFlight, this.inFlight);
    try {
      await delay(5);
      const log = this.logs[jobId];
      if (log === undefined) throw new Error(`no log for job ${jobId}`);
      if (log instanceof Error) throw log;
      return log;
    } finally {
      this.inFlight--;
    }
  }

  async readFile(): Promise<string | null> {
    return null;
  }

  async listDirectory(): Promise<string[] | null> {
    return null;
  }

  async getChangedFiles(): Promise<ChangedFile[]> {
    if (this.changed instanceof Error) throw this.changed;
    return this.changed;
  }

  async getJobHistory(): Promise<JobHistoryEntry[]> {
    return [];
  }
}

function recordingLogger(): AgentLogger & { warnings: string[] } {
  const warnings: string[] = [];
  return { warnings, info: () => {}, debug: () => {}, warning: (msg) => warnings.push(msg) };
}

describe("selectFailedJobs", () => {
  it("orders failure before timed_out, then by completion time, and leaves out cancelled jobs", () => {
    const jobs = [
      job(1, "lint", "success", 20),
      job(2, "e2e", "failure", 300),
      job(3, "integration", "timed_out", 100),
      job(4, "unit", "failure", 120),
      job(5, "deploy-preview", "cancelled", 130),
      job(6, "docs", "skipped", 0),
    ];
    expect(selectFailedJobs(jobs).map((j) => j.name)).toEqual(["unit", "e2e", "integration"]);
  });

  it("falls back to cancelled jobs only when nothing failed", () => {
    const jobs = [job(1, "lint", "success"), job(2, "e2e", "cancelled", 90), job(3, "unit", "cancelled", 30)];
    expect(selectFailedJobs(jobs).map((j) => j.name)).toEqual(["unit", "e2e"]);
  });

  it("puts jobs without a completion time last", () => {
    const pending = { ...job(1, "slow", "failure"), completedAt: null };
    expect(selectFailedJobs([pending, job(2, "fast", "failure", 30)]).map((j) => j.name)).toEqual([
      "fast",
      "slow",
    ]);
  });
});

describe("buildContext", () => {
  it("parses, excerpts and signature-matches each failed job's log", async () => {
    const jobs = [job(1, "lint", "success"), job(2, "build", "failure")];
    const backend = new FakeBackend(jobs, { 2: failingLog("npm ERR! code ERESOLVE") });

    const ctx = await buildContext(backend);

    expect(ctx.run).toBe(RUN);
    expect(ctx.allJobs).toBe(jobs);
    expect(ctx.changedFiles).toEqual(CHANGED);
    expect(ctx.changedFilesError).toBeUndefined();
    expect(ctx.omittedFailedJobs).toEqual([]);
    expect(backend.logRequests).toEqual([2]);

    const [build] = ctx.failedJobs;
    expect(ctx.failedJobs).toHaveLength(1);
    expect(build?.job.name).toBe("build");
    expect(build?.failedSteps.map((s) => s.name)).toEqual(["Run tests"]);
    expect(build?.log?.lineCount).toBe(7);
    expect(build?.log?.stepOf(5)).toBe(2);
    expect(build?.excerpt?.failedSteps).toEqual(["Run tests"]);
    expect(build?.signatures.map((h) => h.id)).toEqual(["npm-eresolve"]);
    expect(build?.signatures[0]).toMatchObject({ jobName: "build", line: 5 });
    expect(build?.logError).toBeUndefined();
  });

  it("orders failed jobs most informative first and caps them", async () => {
    const jobs = [
      job(10, "e2e", "failure", 300),
      job(11, "integration", "timed_out", 100),
      job(12, "unit", "failure", 120),
      job(13, "smoke", "failure", 200),
      job(14, "deploy-preview", "cancelled", 130),
    ];
    const logs = Object.fromEntries(jobs.map((j) => [j.id, failingLog("Error: something broke")]));
    const backend = new FakeBackend(jobs, logs);

    const ctx = await buildContext(backend, { maxFailedJobs: 2 });

    expect(ctx.failedJobs.map((f) => f.job.name)).toEqual(["unit", "smoke"]);
    expect(ctx.omittedFailedJobs).toEqual(["e2e", "integration"]);
    expect([...backend.logRequests].sort()).toEqual([12, 13]);
  });

  it("defaults to 4 failed jobs and fetches logs with at most 4 in flight", async () => {
    const jobs = Array.from({ length: 7 }, (_, i) => job(20 + i, `shard-${i + 1}`, "failure", 60 + i));
    const logs = Object.fromEntries(jobs.map((j) => [j.id, failingLog("Error: shard failed")]));
    const backend = new FakeBackend(jobs, logs);

    const ctx = await buildContext(backend);
    expect(ctx.failedJobs.map((f) => f.job.name)).toEqual(["shard-1", "shard-2", "shard-3", "shard-4"]);
    expect(ctx.omittedFailedJobs).toEqual(["shard-5", "shard-6", "shard-7"]);

    const wide = new FakeBackend(jobs, logs);
    const all = await buildContext(wide, { maxFailedJobs: 10 });
    expect(all.failedJobs).toHaveLength(7);
    expect(wide.maxInFlight).toBe(4);
  });

  it("records a log fetch failure on the job and keeps going", async () => {
    const jobs = [job(30, "unit", "failure", 60), job(31, "e2e", "failure", 90)];
    const backend = new FakeBackend(jobs, {
      30: new Error("Logs for job 30 are unavailable (expired or deleted)"),
      31: failingLog("Error: connect ETIMEDOUT 140.82.112.3:443"),
    });
    const logger = recordingLogger();

    const ctx = await buildContext(backend, { logger });

    const [unit, e2e] = ctx.failedJobs;
    expect(unit).toMatchObject({
      log: null,
      excerpt: null,
      signatures: [],
      logError: "Logs for job 30 are unavailable (expired or deleted)",
    });
    expect(unit?.failedSteps.map((s) => s.name)).toEqual(["Run tests"]);
    expect(e2e?.log).not.toBeNull();
    expect(e2e?.signatures.map((h) => h.id)).toEqual(["network-flake"]);
    expect(logger.warnings).toEqual([expect.stringContaining('"unit"')]);
  });

  it("falls back to the default cap when maxFailedJobs is NaN", async () => {
    const jobs = Array.from({ length: 5 }, (_, i) => job(70 + i, `shard-${i + 1}`, "failure", 60 + i));
    const logs = Object.fromEntries(jobs.map((j) => [j.id, failingLog("Error: shard failed")]));

    const ctx = await buildContext(new FakeBackend(jobs, logs), { maxFailedJobs: Number.NaN });

    expect(ctx.failedJobs).toHaveLength(4);
    expect(ctx.omittedFailedJobs).toEqual(["shard-5"]);
  });

  it("records a non-Error rejection from the log fetch as text", async () => {
    const backend = new FakeBackend([job(80, "unit", "failure")], {});
    backend.getJobLog = () => Promise.reject("HTTP 410 Gone");

    const ctx = await buildContext(backend);

    expect(ctx.failedJobs[0]).toMatchObject({ log: null, excerpt: null, logError: "HTTP 410 Gone" });
  });

  it("records a changed-files failure instead of throwing", async () => {
    const backend = new FakeBackend(
      [job(40, "unit", "failure")],
      { 40: failingLog("Error: x") },
      new Error("HTTP 502"),
    );
    const logger = recordingLogger();

    const ctx = await buildContext(backend, { logger });

    expect(ctx.changedFiles).toEqual([]);
    expect(ctx.changedFilesError).toBe("HTTP 502");
    expect(ctx.failedJobs).toHaveLength(1);
    expect(logger.warnings).toEqual([expect.stringContaining("HTTP 502")]);
  });

  it("honours excerptMaxLines", async () => {
    const lines = Array.from({ length: 400 }, (_, i) => `${ts(10 + i * 0.01)} test output ${i}`);
    const raw = [...lines, `${ts(49)} ##[error]Process completed with exit code 1.`].join("\n");
    const backend = new FakeBackend([job(50, "unit", "failure")], { 50: raw });

    const ctx = await buildContext(backend, { excerptMaxLines: 20 });

    const excerpt = ctx.failedJobs[0]?.excerpt;
    expect(excerpt?.ranges.reduce((sum, r) => sum + r.lines.length, 0)).toBeLessThanOrEqual(20);
    expect(excerpt?.totalLines).toBe(401);
  });

  it("returns an empty failed-job list when nothing failed", async () => {
    const ctx = await buildContext(new FakeBackend([job(60, "unit", "success")], {}));
    expect(ctx.failedJobs).toEqual([]);
    expect(ctx.omittedFailedJobs).toEqual([]);
    expect(ctx.allJobs).toHaveLength(1);
  });

  it("propagates getRun and listJobs failures", async () => {
    const broken = new FakeBackend([], {});
    broken.getRun = () => Promise.reject(new Error("HTTP 401"));
    await expect(buildContext(broken)).rejects.toThrow("HTTP 401");

    const noJobs = new FakeBackend([], {});
    noJobs.listJobs = () => Promise.reject(new Error("HTTP 500"));
    await expect(buildContext(noJobs)).rejects.toThrow("HTTP 500");
  });
});
