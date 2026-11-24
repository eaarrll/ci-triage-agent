import { beforeEach, describe, expect, it, vi } from "vitest";
import { createGitHubBackend, normalizeRepoPath } from "../src/github/gateway.js";
import type { Octokit } from "../src/github/gateway.js";
import type { RepoRef, RunInfo } from "../src/types.js";

// ---------------------------------------------------------------------------
// Mock Octokit: one vi.fn per REST method used, and a paginate that walks pages the way
// Octokit does (namespaced list payloads such as { jobs: [...] } are unwrapped to arrays).
// ---------------------------------------------------------------------------

type Params = Record<string, unknown>;
type Method = (params: Params) => Promise<{ data: unknown }>;
type MapFn = (response: { data: unknown[] }, done: () => void) => unknown[];

function createMockOctokit() {
  const rest = {
    actions: {
      getWorkflowRun: vi.fn(),
      listJobsForWorkflowRunAttempt: vi.fn(),
      listJobsForWorkflowRun: vi.fn(),
      downloadJobLogsForWorkflowRun: vi.fn(),
      listWorkflowRuns: vi.fn(),
    },
    repos: {
      get: vi.fn(),
      getContent: vi.fn(),
      getCommit: vi.fn(),
      compareCommitsWithBasehead: vi.fn(),
      listPullRequestsAssociatedWithCommit: vi.fn(),
    },
    git: { getBlob: vi.fn() },
    pulls: { list: vi.fn(), listFiles: vi.fn(), get: vi.fn() },
    issues: { listComments: vi.fn(), createComment: vi.fn(), updateComment: vi.fn() },
  };

  const paginate = vi.fn(async (method: Method, params: Params, mapFn?: MapFn) => {
    const perPage = typeof params.per_page === "number" ? params.per_page : 30;
    const collected: unknown[] = [];
    for (let page = 1; ; page++) {
      const { data } = await method({ ...params, page });
      const items = pageItems(data);
      let stop = false;
      collected.push(...(mapFn ? mapFn({ data: items }, () => (stop = true)) : items));
      if (stop || items.length < perPage) return collected;
    }
  });

  return { rest, paginate, octokit: { rest, paginate } as unknown as Octokit };
}

function pageItems(data: unknown): unknown[] {
  if (Array.isArray(data)) return data;
  const list = Object.values(data as Record<string, unknown>).find(Array.isArray);
  return list ?? [];
}

type MockOctokit = ReturnType<typeof createMockOctokit>;

const ok = <T>(data: T) => ({ data, status: 200, headers: {} });

function httpError(status: number, message = `HTTP ${status}`, headers: Record<string, string> = {}): Error {
  return Object.assign(new Error(message), { status, response: { status, headers, data: {} } });
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const REPO: RepoRef = { owner: "example-org", repo: "widgets" };
const RUN_ID = 9001;
const HEAD_SHA = "a".repeat(40);
const BASE_REPO = { id: 1, full_name: "example-org/widgets", default_branch: "main" };

function workflowRun(overrides: Record<string, unknown> = {}) {
  return {
    id: RUN_ID,
    name: "CI",
    path: ".github/workflows/ci.yml@refs/heads/feature/discounts",
    run_attempt: 1,
    event: "pull_request",
    head_branch: "feature/discounts",
    head_sha: HEAD_SHA,
    workflow_id: 77,
    conclusion: "failure",
    html_url: `https://github.com/example-org/widgets/actions/runs/${RUN_ID}`,
    display_title: "Fix discount rounding",
    created_at: "2026-11-20T10:00:00Z",
    pull_requests: [{ number: 42, base: { repo: { id: 1 } }, head: { repo: { id: 1 } } }],
    repository: BASE_REPO,
    head_repository: { id: 1, full_name: "example-org/widgets" },
    ...overrides,
  };
}

function job(overrides: Record<string, unknown> = {}) {
  return {
    id: 501,
    name: "test",
    status: "completed",
    conclusion: "failure",
    created_at: "2026-11-20T10:00:05Z",
    started_at: "2026-11-20T10:00:10Z",
    completed_at: "2026-11-20T10:03:00Z",
    labels: ["ubuntu-latest"],
    html_url: "https://github.com/example-org/widgets/actions/runs/9001/job/501",
    steps: [
      {
        number: 1,
        name: "Set up job",
        status: "completed",
        conclusion: "success",
        started_at: "2026-11-20T10:00:10Z",
        completed_at: "2026-11-20T10:00:12Z",
      },
      { number: 2, name: "Run tests", status: "completed", conclusion: "failure" },
    ],
    ...overrides,
  };
}

function runInfo(overrides: Partial<RunInfo> = {}): RunInfo {
  return {
    id: RUN_ID,
    attempt: 1,
    workflowId: 77,
    workflowName: "CI",
    workflowPath: ".github/workflows/ci.yml",
    event: "pull_request",
    headBranch: "feature/discounts",
    headSha: HEAD_SHA,
    headRepoFullName: "example-org/widgets",
    isFork: false,
    defaultBranch: "main",
    conclusion: "failure",
    htmlUrl: "https://github.com/example-org/widgets/actions/runs/9001",
    displayTitle: null,
    pullRequestNumbers: [],
    createdAt: "2026-11-20T10:00:00Z",
    ...overrides,
  };
}

function base64(text: string): string {
  return Buffer.from(text, "utf8").toString("base64");
}

let mock: MockOctokit;
let sleep: ReturnType<typeof vi.fn<(ms: number) => Promise<void>>>;

function backend() {
  return createGitHubBackend(mock.octokit, REPO, RUN_ID, { sleep });
}

beforeEach(() => {
  mock = createMockOctokit();
  sleep = vi.fn(async () => {});
  mock.rest.actions.getWorkflowRun.mockResolvedValue(ok(workflowRun()));
  // By default the PR's head is still the failing commit.
  mock.rest.pulls.get.mockResolvedValue(ok({ head: { sha: HEAD_SHA }, base: { sha: "b".repeat(40) } }));
});

// ---------------------------------------------------------------------------
// getRun
// ---------------------------------------------------------------------------

describe("getRun", () => {
  it("normalizes a same-repo run and strips the @ref suffix from the workflow path", async () => {
    const run = await backend().getRun();

    expect(mock.rest.actions.getWorkflowRun).toHaveBeenCalledWith({ ...REPO, run_id: RUN_ID });
    expect(run).toEqual({
      id: RUN_ID,
      attempt: 1,
      workflowId: 77,
      workflowName: "CI",
      workflowPath: ".github/workflows/ci.yml",
      event: "pull_request",
      headBranch: "feature/discounts",
      headSha: HEAD_SHA,
      headRepoFullName: "example-org/widgets",
      isFork: false,
      defaultBranch: "main",
      conclusion: "failure",
      htmlUrl: `https://github.com/example-org/widgets/actions/runs/${RUN_ID}`,
      displayTitle: "Fix discount rounding",
      pullRequestNumbers: [42],
      createdAt: "2026-11-20T10:00:00Z",
    });
  });

  it("detects fork runs and ignores pull requests that belong to another repository", async () => {
    mock.rest.actions.getWorkflowRun.mockResolvedValue(
      ok(
        workflowRun({
          head_repository: { id: 2, full_name: "contributor/widgets" },
          pull_requests: [
            { number: 7, base: { repo: { id: 999 } } },
            { number: 42, base: { repo: { id: 1 } } },
          ],
          run_attempt: undefined,
          display_title: undefined,
        }),
      ),
    );

    const run = await backend().getRun();

    expect(run.isFork).toBe(true);
    expect(run.headRepoFullName).toBe("contributor/widgets");
    expect(run.pullRequestNumbers).toEqual([42]);
    expect(run.attempt).toBe(1);
    expect(run.displayTitle).toBeNull();
  });

  it("falls back to repos.get when the run payload has no default branch", async () => {
    mock.rest.actions.getWorkflowRun.mockResolvedValue(
      ok(workflowRun({ repository: { id: 1, full_name: "example-org/widgets" } })),
    );
    mock.rest.repos.get.mockResolvedValue(ok({ default_branch: "trunk" }));

    const run = await backend().getRun();

    expect(run.defaultBranch).toBe("trunk");
    expect(mock.rest.repos.get).toHaveBeenCalledWith(REPO);
  });

  it("is memoized across sequential and concurrent calls", async () => {
    const gateway = backend();

    const [a, b] = await Promise.all([gateway.getRun(), gateway.getRun()]);
    const c = await gateway.getRun();

    expect(a).toBe(b);
    expect(c).toBe(a);
    expect(mock.rest.actions.getWorkflowRun).toHaveBeenCalledTimes(1);
  });

  it("does not cache a failed lookup", async () => {
    mock.rest.actions.getWorkflowRun
      .mockRejectedValueOnce(httpError(404))
      .mockResolvedValue(ok(workflowRun()));
    const gateway = backend();

    await expect(gateway.getRun()).rejects.toMatchObject({ status: 404 });
    await expect(gateway.getRun()).resolves.toMatchObject({ id: RUN_ID });
    expect(mock.rest.actions.getWorkflowRun).toHaveBeenCalledTimes(2);
  });
});

// ---------------------------------------------------------------------------
// listJobs / getJobLog
// ---------------------------------------------------------------------------

describe("listJobs", () => {
  it("lists every job of the run's current attempt and maps them", async () => {
    mock.rest.actions.getWorkflowRun.mockResolvedValue(ok(workflowRun({ run_attempt: 2 })));
    mock.rest.actions.listJobsForWorkflowRunAttempt.mockResolvedValue(
      ok({
        total_count: 2,
        jobs: [job(), job({ id: 502, name: "lint", conclusion: "success", steps: undefined })],
      }),
    );

    const jobs = await backend().listJobs();

    expect(mock.rest.actions.listJobsForWorkflowRunAttempt).toHaveBeenCalledWith(
      expect.objectContaining({ ...REPO, run_id: RUN_ID, attempt_number: 2, per_page: 100 }),
    );
    expect(jobs).toEqual([
      {
        id: 501,
        name: "test",
        status: "completed",
        conclusion: "failure",
        startedAt: "2026-11-20T10:00:10Z",
        completedAt: "2026-11-20T10:03:00Z",
        runnerLabels: ["ubuntu-latest"],
        htmlUrl: "https://github.com/example-org/widgets/actions/runs/9001/job/501",
        steps: [
          {
            number: 1,
            name: "Set up job",
            status: "completed",
            conclusion: "success",
            startedAt: "2026-11-20T10:00:10Z",
            completedAt: "2026-11-20T10:00:12Z",
          },
          {
            number: 2,
            name: "Run tests",
            status: "completed",
            conclusion: "failure",
            startedAt: null,
            completedAt: null,
          },
        ],
      },
      expect.objectContaining({ id: 502, name: "lint", conclusion: "success", steps: [] }),
    ]);
  });
});

describe("getJobLog", () => {
  const LOG = "2026-11-20T10:00:10.0000000Z ##[group]Run npm test\n2026-11-20T10:00:11.0000000Z ✗ 1 failed\n";

  it("returns string payloads as-is", async () => {
    mock.rest.actions.downloadJobLogsForWorkflowRun.mockResolvedValue(ok(LOG));

    await expect(backend().getJobLog(501)).resolves.toBe(LOG);
    expect(mock.rest.actions.downloadJobLogsForWorkflowRun).toHaveBeenCalledWith({ ...REPO, job_id: 501 });
  });

  it("drops a BOM from a string payload", async () => {
    mock.rest.actions.downloadJobLogsForWorkflowRun.mockResolvedValue(ok(`\uFEFF${LOG}`));

    await expect(backend().getJobLog(501)).resolves.toBe(LOG);
  });

  it("decodes binary payloads (ArrayBuffer and Buffer) as UTF-8 and drops a BOM", async () => {
    const bytes = Buffer.from(`\uFEFF${LOG}`, "utf8");
    const arrayBuffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    mock.rest.actions.downloadJobLogsForWorkflowRun
      .mockResolvedValueOnce(ok(arrayBuffer))
      .mockResolvedValueOnce(ok(bytes));
    const gateway = backend();

    await expect(gateway.getJobLog(501)).resolves.toBe(LOG);
    await expect(gateway.getJobLog(501)).resolves.toBe(LOG);
  });

  it.each([404, 410])("reports expired or deleted logs on %i", async (status) => {
    mock.rest.actions.downloadJobLogsForWorkflowRun.mockRejectedValue(httpError(status));

    await expect(backend().getJobLog(501)).rejects.toThrow(
      "Logs for job 501 are unavailable (expired or deleted)",
    );
  });

  it("rethrows other errors unchanged", async () => {
    const forbidden = httpError(403, "Resource not accessible by integration");
    mock.rest.actions.downloadJobLogsForWorkflowRun.mockRejectedValue(forbidden);

    await expect(backend().getJobLog(501)).rejects.toBe(forbidden);
  });
});

// ---------------------------------------------------------------------------
// readFile / listDirectory
// ---------------------------------------------------------------------------

function fileContent(text: string, overrides: Record<string, unknown> = {}) {
  return {
    type: "file",
    encoding: "base64",
    size: Buffer.byteLength(text),
    sha: "f".repeat(40),
    content: base64(text),
    ...overrides,
  };
}

describe("readFile", () => {
  it("decodes base64 content at the requested ref and normalizes the path", async () => {
    const text = "export const rate = 0.15; // ünïcode ok\n";
    mock.rest.repos.getContent.mockResolvedValue(ok(fileContent(text)));

    await expect(backend().readFile("./src/pricing.ts", "main")).resolves.toBe(text);
    expect(mock.rest.repos.getContent).toHaveBeenCalledWith({ ...REPO, path: "src/pricing.ts", ref: "main" });
  });

  it("fetches the blob when the contents API omits a large file's body", async () => {
    const big = "x".repeat(64) + "\n";
    mock.rest.repos.getContent.mockResolvedValue(
      ok(fileContent("", { encoding: "none", content: "", size: 2_000_000, sha: "b".repeat(40) })),
    );
    mock.rest.git.getBlob.mockResolvedValue(ok({ content: base64(big), encoding: "base64" }));

    await expect(backend().readFile("/dist/bundle.js", HEAD_SHA)).resolves.toBe(big);
    expect(mock.rest.git.getBlob).toHaveBeenCalledWith({ ...REPO, file_sha: "b".repeat(40) });
  });

  it("returns an empty string for an empty file without fetching the blob", async () => {
    mock.rest.repos.getContent.mockResolvedValue(ok(fileContent("", { size: 0, content: "" })));

    await expect(backend().readFile(".gitkeep", "main")).resolves.toBe("");
    expect(mock.rest.git.getBlob).not.toHaveBeenCalled();
  });

  it.each([
    "../secrets.env",
    "src/../../etc/passwd",
    "src\\..\\..\\x",
    "https://example.com/x",
    "C:\\repo\\x",
    "",
    "/",
  ])("rejects %j without calling the API", async (path) => {
    await expect(backend().readFile(path, "main")).resolves.toBeNull();
    expect(mock.rest.repos.getContent).not.toHaveBeenCalled();
  });

  it("returns null for directories, non-file entries and missing paths", async () => {
    mock.rest.repos.getContent
      .mockResolvedValueOnce(ok([{ type: "file", name: "a.ts" }]))
      .mockResolvedValueOnce(ok({ type: "submodule", size: 0, sha: "c".repeat(40) }))
      .mockRejectedValueOnce(httpError(404));
    const gateway = backend();

    await expect(gateway.readFile("src", "main")).resolves.toBeNull();
    await expect(gateway.readFile("vendor/lib", "main")).resolves.toBeNull();
    await expect(gateway.readFile("missing.ts", "main")).resolves.toBeNull();
  });
});

describe("listDirectory", () => {
  it.each(["", ".", "/", "./"])("treats %j as the repository root", async (path) => {
    mock.rest.repos.getContent.mockResolvedValue(ok([]));

    await expect(backend().listDirectory(path, "main")).resolves.toEqual([]);
    expect(mock.rest.repos.getContent).toHaveBeenCalledWith({ ...REPO, path: "", ref: "main" });
  });

  it("returns sorted names with directories suffixed by a slash", async () => {
    mock.rest.repos.getContent.mockResolvedValue(
      ok([
        { type: "file", name: "package.json" },
        { type: "dir", name: "src" },
        { type: "file", name: "README.md" },
        { type: "dir", name: ".github" },
        { type: "symlink", name: "latest" },
      ]),
    );

    await expect(backend().listDirectory("./", HEAD_SHA)).resolves.toEqual([
      ".github/",
      "README.md",
      "latest",
      "package.json",
      "src/",
    ]);
  });

  it("returns null for files, missing paths and traversal attempts", async () => {
    mock.rest.repos.getContent
      .mockResolvedValueOnce(ok(fileContent("{}")))
      .mockRejectedValueOnce(httpError(404));
    const gateway = backend();

    await expect(gateway.listDirectory("package.json", "main")).resolves.toBeNull();
    await expect(gateway.listDirectory("nope", "main")).resolves.toBeNull();
    await expect(gateway.listDirectory("../other-repo", "main")).resolves.toBeNull();
    expect(mock.rest.repos.getContent).toHaveBeenCalledTimes(2);
  });
});

describe("normalizeRepoPath", () => {
  it("collapses redundant separators and dot segments", () => {
    expect(normalizeRepoPath("./src//lib/./util.ts")).toBe("src/lib/util.ts");
    expect(normalizeRepoPath("  /.github/workflows/ci.yml ")).toBe(".github/workflows/ci.yml");
    expect(normalizeRepoPath("docs/")).toBe("docs");
  });

  it("rejects parent segments, schemes and NUL bytes", () => {
    expect(normalizeRepoPath("a/../b")).toBeNull();
    expect(normalizeRepoPath("file:///etc/passwd")).toBeNull();
    expect(normalizeRepoPath("src/a.ts\0.png")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// getChangedFiles
// ---------------------------------------------------------------------------

function diffEntry(i: number, overrides: Record<string, unknown> = {}) {
  return {
    filename: `src/file-${i}.ts`,
    status: "modified",
    additions: 3,
    deletions: 1,
    patch: "@@ -1 +1 @@\n-old\n+new",
    ...overrides,
  };
}

describe("getChangedFiles", () => {
  it("lists the pull request's files when the run has a PR", async () => {
    mock.rest.pulls.listFiles.mockResolvedValue(
      ok([
        diffEntry(1),
        diffEntry(2, { status: "renamed", previous_filename: "src/old.ts", patch: undefined }),
      ]),
    );

    const files = await backend().getChangedFiles();

    expect(mock.rest.pulls.listFiles).toHaveBeenCalledWith(
      expect.objectContaining({ ...REPO, pull_number: 42 }),
    );
    expect(mock.rest.repos.getCommit).not.toHaveBeenCalled();
    expect(files).toEqual([
      {
        path: "src/file-1.ts",
        status: "modified",
        additions: 3,
        deletions: 1,
        patch: "@@ -1 +1 @@\n-old\n+new",
        previousPath: null,
      },
      {
        path: "src/file-2.ts",
        status: "renamed",
        additions: 3,
        deletions: 1,
        patch: null,
        previousPath: "src/old.ts",
      },
    ]);
  });

  it("stops paginating at 300 files", async () => {
    const pages = 5;
    mock.rest.pulls.listFiles.mockImplementation(async (params: Params) => {
      const page = params.page as number;
      const size = page <= pages ? 100 : 0;
      return ok(Array.from({ length: size }, (_, i) => diffEntry((page - 1) * 100 + i)));
    });

    const files = await backend().getChangedFiles();

    expect(files).toHaveLength(300);
    expect(mock.rest.pulls.listFiles).toHaveBeenCalledTimes(3);
  });

  it("uses a PR found from the head commit when the run lists none", async () => {
    mock.rest.actions.getWorkflowRun.mockResolvedValue(ok(workflowRun({ pull_requests: [] })));
    mock.rest.repos.listPullRequestsAssociatedWithCommit.mockResolvedValue(
      ok([{ number: 51, state: "open", head: { sha: HEAD_SHA } }]),
    );
    mock.rest.pulls.listFiles.mockResolvedValue(ok([diffEntry(1)]));

    await backend().getChangedFiles();

    expect(mock.rest.pulls.listFiles).toHaveBeenCalledWith(expect.objectContaining({ pull_number: 51 }));
  });

  it("falls back to the head commit's files when there is no PR", async () => {
    mock.rest.actions.getWorkflowRun.mockResolvedValue(
      ok(workflowRun({ event: "push", head_branch: "main", pull_requests: [] })),
    );
    mock.rest.repos.listPullRequestsAssociatedWithCommit.mockResolvedValue(ok([]));
    mock.rest.pulls.list.mockResolvedValue(ok([]));
    mock.rest.repos.getCommit.mockResolvedValue(
      ok({ sha: HEAD_SHA, files: [diffEntry(9, { status: "added" })] }),
    );

    const files = await backend().getChangedFiles();

    expect(mock.rest.repos.getCommit).toHaveBeenCalledWith({ ...REPO, ref: HEAD_SHA });
    expect(mock.rest.pulls.listFiles).not.toHaveBeenCalled();
    expect(files).toEqual([expect.objectContaining({ path: "src/file-9.ts", status: "added" })]);
  });
});

// ---------------------------------------------------------------------------
// getJobHistory
// ---------------------------------------------------------------------------

function historyRun(id: number, createdAt: string, overrides: Record<string, unknown> = {}) {
  return workflowRun({
    id,
    created_at: createdAt,
    event: "push",
    head_branch: "main",
    head_sha: `${id}`.padStart(40, "0"),
    html_url: `https://github.com/example-org/widgets/actions/runs/${id}`,
    pull_requests: [],
    ...overrides,
  });
}

describe("getJobHistory", () => {
  beforeEach(() => {
    mock.rest.actions.getWorkflowRun.mockResolvedValue(ok(workflowRun({ run_attempt: 3 })));
    mock.rest.actions.listJobsForWorkflowRunAttempt.mockImplementation(async (params: Params) => {
      const attempt = params.attempt_number as number;
      const created = `2026-11-20T1${attempt}:00:00Z`;
      return ok({
        jobs: [
          job({ id: 600 + attempt, conclusion: attempt === 1 ? "failure" : "success", created_at: created }),
        ],
      });
    });
    mock.rest.actions.listJobsForWorkflowRun.mockImplementation(async (params: Params) => {
      const runId = params.run_id as number;
      if (runId === 103) throw httpError(404);
      if (runId === 104) return ok({ jobs: [job({ name: "lint" })] });
      return ok({
        jobs: [
          job({
            id: runId * 10,
            html_url: `https://github.com/example-org/widgets/actions/runs/${runId}/job/1`,
          }),
        ],
      });
    });
  });

  it("combines previous attempts of this run with default-branch runs, newest first", async () => {
    mock.rest.actions.listWorkflowRuns.mockResolvedValue(
      ok({
        total_count: 6,
        workflow_runs: [
          historyRun(RUN_ID, "2026-11-20T10:00:00Z"), // the run being triaged
          historyRun(101, "2026-11-19T09:00:00Z"),
          historyRun(102, "2026-11-19T12:00:00Z", { head_sha: HEAD_SHA, run_attempt: 2 }),
          historyRun(103, "2026-11-18T09:00:00Z"), // lookup fails
          historyRun(104, "2026-11-17T09:00:00Z"), // job not in that run
          historyRun(105, "2026-11-16T09:00:00Z", { head_repository: { full_name: "contributor/widgets" } }),
        ],
      }),
    );

    const history = await backend().getJobHistory("test", 10);

    expect(mock.rest.actions.listWorkflowRuns).toHaveBeenCalledWith({
      ...REPO,
      workflow_id: 77,
      branch: "main",
      status: "completed",
      per_page: 11,
      exclude_pull_requests: true,
    });
    expect(mock.rest.actions.listJobsForWorkflowRun).toHaveBeenCalledWith(
      expect.objectContaining({ run_id: 101, filter: "latest" }),
    );
    expect(mock.rest.actions.listJobsForWorkflowRunAttempt).toHaveBeenCalledTimes(2);
    expect(history.map((e) => [e.runId, e.attempt])).toEqual([
      [RUN_ID, 2],
      [RUN_ID, 1],
      [102, 2],
      [101, 1],
    ]);
    expect(history[1]).toEqual({
      runId: RUN_ID,
      attempt: 1,
      headSha: HEAD_SHA,
      branch: "feature/discounts",
      event: "pull_request",
      conclusion: "failure",
      createdAt: "2026-11-20T11:00:00Z",
      sameSha: true,
      htmlUrl: "https://github.com/example-org/widgets/actions/runs/9001/job/501",
    });
    expect(history[2]).toMatchObject({ runId: 102, branch: "main", event: "push", sameSha: true });
    expect(history[3]).toMatchObject({
      runId: 101,
      sameSha: false,
      createdAt: "2026-11-19T09:00:00Z",
      htmlUrl: "https://github.com/example-org/widgets/actions/runs/101/job/1",
    });
  });

  it("applies the limit to default-branch runs only", async () => {
    mock.rest.actions.listWorkflowRuns.mockResolvedValue(
      ok({
        workflow_runs: [
          historyRun(101, "2026-11-19T09:00:00Z"),
          historyRun(102, "2026-11-18T09:00:00Z"),
          historyRun(105, "2026-11-17T09:00:00Z"),
        ],
      }),
    );

    const history = await backend().getJobHistory("test", 2);

    expect(mock.rest.actions.listWorkflowRuns).toHaveBeenCalledWith(expect.objectContaining({ per_page: 3 }));
    expect(history.filter((e) => e.runId !== RUN_ID).map((e) => e.runId)).toEqual([101, 102]);
    expect(history.filter((e) => e.runId === RUN_ID)).toHaveLength(2);
  });

  it("skips the default-branch query when the limit is zero", async () => {
    const history = await backend().getJobHistory("test", 0);

    expect(mock.rest.actions.listWorkflowRuns).not.toHaveBeenCalled();
    expect(history).toHaveLength(2);
  });

  it("returns only default-branch runs for a first attempt", async () => {
    mock.rest.actions.getWorkflowRun.mockResolvedValue(ok(workflowRun({ run_attempt: 1 })));
    mock.rest.actions.listWorkflowRuns.mockResolvedValue(
      ok({ workflow_runs: [historyRun(101, "2026-11-19T09:00:00Z")] }),
    );

    const history = await backend().getJobHistory("test", 5);

    expect(mock.rest.actions.listJobsForWorkflowRunAttempt).not.toHaveBeenCalled();
    expect(history.map((e) => e.runId)).toEqual([101]);
  });
});

// ---------------------------------------------------------------------------
// CommentPort
// ---------------------------------------------------------------------------

describe("findPullRequest", () => {
  it("uses the run's own PR number without any API call", async () => {
    await expect(backend().findPullRequest(runInfo({ pullRequestNumbers: [42] }))).resolves.toBe(42);
    expect(mock.rest.repos.listPullRequestsAssociatedWithCommit).not.toHaveBeenCalled();
  });

  it("takes the first open associated PR when none is at the head SHA", async () => {
    mock.rest.repos.listPullRequestsAssociatedWithCommit.mockResolvedValue(
      ok([
        { number: 10, state: "closed", head: { sha: HEAD_SHA } },
        { number: 11, state: "open", head: { sha: "d".repeat(40) } },
        { number: 13, state: "open", head: { sha: "e".repeat(40) } },
      ]),
    );

    await expect(backend().findPullRequest(runInfo())).resolves.toBe(11);
  });

  it("does not pin a push run on another branch's PR that merely contains the commit", async () => {
    mock.rest.repos.listPullRequestsAssociatedWithCommit.mockResolvedValue(
      ok([{ number: 11, state: "open", head: { sha: "d".repeat(40), ref: "feature/other" } }]),
    );
    mock.rest.pulls.list.mockResolvedValue(ok([]));

    await expect(
      backend().findPullRequest(runInfo({ event: "push", headBranch: "feature/mine" })),
    ).resolves.toBeNull();
  });

  it("picks an open PR associated with the head commit, preferring one at that SHA", async () => {
    mock.rest.repos.listPullRequestsAssociatedWithCommit.mockResolvedValue(
      ok([
        { number: 10, state: "closed", head: { sha: HEAD_SHA } },
        { number: 11, state: "open", head: { sha: "d".repeat(40) } },
        { number: 12, state: "open", head: { sha: HEAD_SHA } },
      ]),
    );

    await expect(backend().findPullRequest(runInfo())).resolves.toBe(12);
    expect(mock.rest.repos.listPullRequestsAssociatedWithCommit).toHaveBeenCalledWith({
      ...REPO,
      commit_sha: HEAD_SHA,
    });
    expect(mock.rest.pulls.list).not.toHaveBeenCalled();
  });

  it("falls back to open PRs from the head owner's branch", async () => {
    mock.rest.repos.listPullRequestsAssociatedWithCommit.mockResolvedValue(
      ok([{ number: 10, state: "closed", head: { sha: HEAD_SHA } }]),
    );
    mock.rest.pulls.list.mockResolvedValue(ok([{ number: 77 }]));

    const run = runInfo({ headRepoFullName: "contributor/widgets", isFork: true });

    await expect(backend().findPullRequest(run)).resolves.toBe(77);
    expect(mock.rest.pulls.list).toHaveBeenCalledWith(
      expect.objectContaining({ ...REPO, state: "open", head: "contributor:feature/discounts" }),
    );
  });

  it("returns null when the head branch is unknown", async () => {
    mock.rest.repos.listPullRequestsAssociatedWithCommit.mockResolvedValue(ok([]));

    await expect(backend().findPullRequest(runInfo({ headBranch: null }))).resolves.toBeNull();
    expect(mock.rest.pulls.list).not.toHaveBeenCalled();
  });

  it("returns null on any error", async () => {
    mock.rest.repos.listPullRequestsAssociatedWithCommit.mockRejectedValue(
      httpError(403, "Resource not accessible"),
    );

    await expect(backend().findPullRequest(runInfo())).resolves.toBeNull();
  });
});

const MARKER = "<!-- ci-triage-agent -->";

const BOT = { login: "github-actions[bot]", type: "Bot" };

function comment(id: number, body: string, createdAt: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    body,
    created_at: createdAt,
    html_url: `https://github.com/example-org/widgets/pull/42#issuecomment-${id}`,
    user: BOT,
    author_association: "NONE",
    ...overrides,
  };
}

describe("findComment", () => {
  it("returns the newest comment whose body starts with the marker", async () => {
    mock.rest.issues.listComments.mockResolvedValue(
      ok([
        comment(1, `${MARKER}\nold triage`, "2026-11-19T10:00:00Z"),
        comment(2, `> quoting ${MARKER}`, "2026-11-20T09:00:00Z"),
        comment(3, `\n  ${MARKER}\nnew triage`, "2026-11-20T10:00:00Z"),
        comment(4, "LGTM", "2026-11-20T11:00:00Z"),
      ]),
    );

    await expect(backend().findComment(42, MARKER)).resolves.toEqual({
      id: 3,
      body: `\n  ${MARKER}\nnew triage`,
      htmlUrl: "https://github.com/example-org/widgets/pull/42#issuecomment-3",
    });
    expect(mock.rest.issues.listComments).toHaveBeenCalledWith(
      expect.objectContaining({ ...REPO, issue_number: 42, per_page: 100 }),
    );
  });

  it("returns null when no comment carries the marker", async () => {
    mock.rest.issues.listComments.mockResolvedValue(ok([comment(4, "LGTM", "2026-11-20T11:00:00Z")]));

    await expect(backend().findComment(42, MARKER)).resolves.toBeNull();
  });
});

describe("upsertComment", () => {
  it("creates a comment with the marker prepended when none exists", async () => {
    mock.rest.issues.listComments.mockResolvedValue(ok([]));
    mock.rest.issues.createComment.mockResolvedValue(ok(comment(5, "", "2026-11-20T12:00:00Z")));

    const result = await backend().upsertComment(42, MARKER, "## CI triage\nRoot cause: ...");

    expect(mock.rest.issues.createComment).toHaveBeenCalledWith({
      ...REPO,
      issue_number: 42,
      body: `${MARKER}\n## CI triage\nRoot cause: ...`,
    });
    expect(mock.rest.issues.updateComment).not.toHaveBeenCalled();
    expect(result).toEqual({
      id: 5,
      htmlUrl: "https://github.com/example-org/widgets/pull/42#issuecomment-5",
      created: true,
    });
  });

  it("updates the existing comment without duplicating the marker", async () => {
    mock.rest.issues.listComments.mockResolvedValue(
      ok([comment(3, `${MARKER}\nold`, "2026-11-20T10:00:00Z")]),
    );
    mock.rest.issues.updateComment.mockResolvedValue(ok(comment(3, "", "2026-11-20T10:00:00Z")));

    const result = await backend().upsertComment(42, MARKER, `${MARKER}\nnew`);

    expect(mock.rest.issues.updateComment).toHaveBeenCalledWith({
      ...REPO,
      comment_id: 3,
      body: `${MARKER}\nnew`,
    });
    expect(mock.rest.issues.createComment).not.toHaveBeenCalled();
    expect(result).toEqual({
      id: 3,
      htmlUrl: "https://github.com/example-org/widgets/pull/42#issuecomment-3",
      created: false,
    });
  });
});

// ---------------------------------------------------------------------------
// Retries
// ---------------------------------------------------------------------------

describe("retries", () => {
  it("retries a 502 and then succeeds", async () => {
    mock.rest.actions.getWorkflowRun
      .mockRejectedValueOnce(httpError(502))
      .mockResolvedValue(ok(workflowRun()));

    await expect(backend().getRun()).resolves.toMatchObject({ id: RUN_ID });
    expect(mock.rest.actions.getWorkflowRun).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledTimes(1);
  });

  it("gives up after two retries", async () => {
    mock.rest.actions.getWorkflowRun.mockRejectedValue(httpError(503));

    await expect(backend().getRun()).rejects.toMatchObject({ status: 503 });
    expect(mock.rest.actions.getWorkflowRun).toHaveBeenCalledTimes(3);
    expect(sleep.mock.calls).toEqual([[1_000], [2_000]]);
  });

  it("does not retry a 404", async () => {
    mock.rest.repos.getContent.mockRejectedValue(httpError(404));

    await expect(backend().readFile("missing.ts", "main")).resolves.toBeNull();
    expect(mock.rest.repos.getContent).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it("retries a secondary rate limit 403, honoring retry-after, but not a plain 403", async () => {
    mock.rest.repos.getContent
      .mockRejectedValueOnce(
        httpError(403, "You have exceeded a secondary rate limit", { "retry-after": "3" }),
      )
      .mockResolvedValueOnce(ok(fileContent("ok")))
      .mockRejectedValueOnce(httpError(403, "Resource not accessible by integration"));
    const gateway = backend();

    await expect(gateway.readFile("a.txt", "main")).resolves.toBe("ok");
    expect(sleep).toHaveBeenCalledWith(3_000);
    await expect(gateway.readFile("b.txt", "main")).rejects.toMatchObject({ status: 403 });
    expect(mock.rest.repos.getContent).toHaveBeenCalledTimes(3);
  });

  it("retries comment creation on 429 but never on 5xx, which may already have posted", async () => {
    mock.rest.issues.listComments.mockResolvedValue(ok([]));
    mock.rest.issues.createComment
      .mockRejectedValueOnce(httpError(429))
      .mockResolvedValueOnce(ok(comment(6, "", "2026-11-20T12:00:00Z")))
      .mockRejectedValueOnce(httpError(502));
    const gateway = backend();

    await expect(gateway.upsertComment(42, MARKER, "body")).resolves.toMatchObject({ id: 6, created: true });
    await expect(gateway.upsertComment(42, MARKER, "body")).rejects.toMatchObject({ status: 502 });
    expect(mock.rest.issues.createComment).toHaveBeenCalledTimes(3);
  });
});

// ---------------------------------------------------------------------------
// Edge cases and adversarial inputs
// ---------------------------------------------------------------------------

describe("edge cases", () => {
  describe("getRun", () => {
    it("compares repository names case-insensitively and keeps a path without @ref", async () => {
      mock.rest.actions.getWorkflowRun.mockResolvedValue(
        ok(
          workflowRun({
            name: null,
            path: ".github/workflows/release.yml",
            head_repository: { id: 1, full_name: "Example-Org/Widgets" },
          }),
        ),
      );

      const run = await backend().getRun();

      expect(run.isFork).toBe(false);
      expect(run.workflowPath).toBe(".github/workflows/release.yml");
      expect(run.workflowName).toBe(".github/workflows/release.yml");
    });

    it("tolerates a deleted head repository", async () => {
      mock.rest.actions.getWorkflowRun.mockResolvedValue(ok(workflowRun({ head_repository: null })));

      const run = await backend().getRun();

      expect(run.headRepoFullName).toBeNull();
      expect(run.isFork).toBe(false);
    });
  });

  describe("getJobLog", () => {
    it("decodes only the bytes a typed-array view covers", async () => {
      const backing = new Uint8Array(Buffer.from("XXXXhello\nYYYY", "utf8"));
      mock.rest.actions.downloadJobLogsForWorkflowRun.mockResolvedValue(ok(backing.subarray(4, 10)));

      await expect(backend().getJobLog(501)).resolves.toBe("hello\n");
    });

    it("keeps an empty log as an empty string", async () => {
      mock.rest.actions.downloadJobLogsForWorkflowRun.mockResolvedValue(ok(""));

      await expect(backend().getJobLog(501)).resolves.toBe("");
    });

    it("fails instead of returning an empty log when the body could not be read", async () => {
      // Octokit resolves data to undefined when reading a text body fails mid-transfer.
      mock.rest.actions.downloadJobLogsForWorkflowRun.mockResolvedValue(ok(undefined));

      await expect(backend().getJobLog(501)).rejects.toThrow("Log download returned no body");
    });

    it("retries a 5xx and still reports expired logs afterwards", async () => {
      mock.rest.actions.downloadJobLogsForWorkflowRun
        .mockRejectedValueOnce(httpError(502))
        .mockRejectedValueOnce(httpError(410));

      await expect(backend().getJobLog(7)).rejects.toThrow(
        "Logs for job 7 are unavailable (expired or deleted)",
      );
      expect(mock.rest.actions.downloadJobLogsForWorkflowRun).toHaveBeenCalledTimes(2);
    });
  });

  describe("readFile / listDirectory paths", () => {
    it.each([
      "..",
      "./..",
      "src/..",
      "a/./../b",
      "a//..//b",
      " ../x ",
      "..\\x",
      "src/../../../etc/passwd",
      "file:/etc/passwd",
      "javascript:alert(1)",
      "d:/repo/x",
      "src\0/../x",
    ])("rejects %j without calling the API", async (path) => {
      const gateway = backend();

      await expect(gateway.readFile(path, "main")).resolves.toBeNull();
      await expect(gateway.listDirectory(path, "main")).resolves.toBeNull();
      expect(mock.rest.repos.getContent).not.toHaveBeenCalled();
    });

    it("passes percent-escapes through literally instead of decoding them into '..'", async () => {
      mock.rest.repos.getContent.mockRejectedValue(httpError(404));

      await expect(backend().readFile("%2e%2e/secret", "main")).resolves.toBeNull();
      expect(mock.rest.repos.getContent).toHaveBeenCalledWith({
        ...REPO,
        path: "%2e%2e/secret",
        ref: "main",
      });
    });

    it("treats names that merely contain dots as ordinary paths", () => {
      expect(normalizeRepoPath("...")).toBe("...");
      expect(normalizeRepoPath("a/..b/c..")).toBe("a/..b/c..");
    });

    it("returns null for a symlink entry", async () => {
      mock.rest.repos.getContent.mockResolvedValue(
        ok({ type: "symlink", target: "../outside", size: 10, sha: "d".repeat(40) }),
      );

      await expect(backend().readFile("link", "main")).resolves.toBeNull();
    });

    it("returns a utf-8 encoded blob as-is", async () => {
      mock.rest.repos.getContent.mockResolvedValue(
        ok(fileContent("", { encoding: "none", content: "", size: 1_500_000 })),
      );
      mock.rest.git.getBlob.mockResolvedValue(ok({ content: "plain text", encoding: "utf-8" }));

      await expect(backend().readFile("big.txt", "main")).resolves.toBe("plain text");
    });

    it("surfaces permission errors instead of reporting the path as missing", async () => {
      mock.rest.repos.getContent.mockRejectedValue(httpError(403, "Resource not accessible by integration"));
      const gateway = backend();

      await expect(gateway.readFile("a.ts", "main")).rejects.toMatchObject({ status: 403 });
      await expect(gateway.listDirectory("src", "main")).rejects.toMatchObject({ status: 403 });
    });
  });

  describe("getChangedFiles", () => {
    it("collects every page below the cap", async () => {
      const sizes = [100, 100, 50];
      mock.rest.pulls.listFiles.mockImplementation(async (params: Params) => {
        const page = params.page as number;
        return ok(Array.from({ length: sizes[page - 1] ?? 0 }, (_, i) => diffEntry(page * 1000 + i)));
      });

      await expect(backend().getChangedFiles()).resolves.toHaveLength(250);
      expect(mock.rest.pulls.listFiles).toHaveBeenCalledTimes(3);
    });

    it("returns an empty list for a commit without files", async () => {
      mock.rest.actions.getWorkflowRun.mockResolvedValue(
        ok(workflowRun({ event: "push", pull_requests: [] })),
      );
      mock.rest.repos.listPullRequestsAssociatedWithCommit.mockRejectedValue(httpError(500));
      mock.rest.repos.getCommit.mockResolvedValue(ok({ sha: HEAD_SHA }));

      await expect(backend().getChangedFiles()).resolves.toEqual([]);
      expect(mock.rest.repos.getCommit).toHaveBeenCalledTimes(1);
    });
  });

  describe("getJobHistory", () => {
    beforeEach(() => {
      mock.rest.actions.getWorkflowRun.mockResolvedValue(ok(workflowRun({ run_attempt: 1 })));
      mock.rest.actions.listJobsForWorkflowRun.mockImplementation(async (params: Params) =>
        ok({ jobs: [job({ id: params.run_id })] }),
      );
    });

    function runs(count: number) {
      return Array.from({ length: count }, (_, i) => historyRun(200 + i, `2026-11-1${i}T09:00:00Z`));
    }

    it("keeps at most four run lookups in flight", async () => {
      mock.rest.actions.listWorkflowRuns.mockResolvedValue(ok({ workflow_runs: runs(10) }));
      let inFlight = 0;
      let peak = 0;
      mock.rest.actions.listJobsForWorkflowRun.mockImplementation(async (params: Params) => {
        peak = Math.max(peak, ++inFlight);
        await new Promise((resolve) => setTimeout(resolve, 1));
        inFlight--;
        return ok({ jobs: [job({ id: params.run_id })] });
      });

      const history = await backend().getJobHistory("test", 10);

      expect(peak).toBe(4);
      expect(history.map((e) => e.runId)).toEqual([209, 208, 207, 206, 205, 204, 203, 202, 201, 200]);
    });

    it.each([
      [Number.NaN, 0],
      [-3, 0],
      [2.9, 2],
      [Number.POSITIVE_INFINITY, 99],
      [1_000, 99],
    ])("clamps a limit of %s to %s", async (limit, expected) => {
      mock.rest.actions.listWorkflowRuns.mockResolvedValue(ok({ workflow_runs: runs(3) }));

      const history = await backend().getJobHistory("test", limit);

      if (expected === 0) {
        expect(mock.rest.actions.listWorkflowRuns).not.toHaveBeenCalled();
        expect(history).toEqual([]);
      } else {
        expect(mock.rest.actions.listWorkflowRuns).toHaveBeenCalledWith(
          expect.objectContaining({ per_page: expected + 1 }),
        );
        expect(history).toHaveLength(Math.min(expected, 3));
      }
    });

    it("matches the job name exactly", async () => {
      mock.rest.actions.listWorkflowRuns.mockResolvedValue(ok({ workflow_runs: runs(1) }));
      mock.rest.actions.listJobsForWorkflowRun.mockResolvedValue(
        ok({ jobs: [job({ name: "Test" }), job({ name: "test (ubuntu-latest)" }), job({ name: "test.*" })] }),
      );

      await expect(backend().getJobHistory("test", 5)).resolves.toEqual([]);
      await expect(backend().getJobHistory("test.*", 5)).resolves.toHaveLength(1);
    });

    it("skips a previous attempt whose lookup fails", async () => {
      mock.rest.actions.getWorkflowRun.mockResolvedValue(ok(workflowRun({ run_attempt: 3 })));
      mock.rest.actions.listJobsForWorkflowRunAttempt.mockImplementation(async (params: Params) => {
        if (params.attempt_number === 1) throw httpError(404);
        return ok({ jobs: [job({ created_at: "2026-11-20T12:00:00Z" })] });
      });

      const history = await backend().getJobHistory("test", 0);

      expect(history.map((e) => [e.runId, e.attempt, e.sameSha])).toEqual([[RUN_ID, 2, true]]);
    });

    it("fails rather than returning half the history when the run listing fails", async () => {
      mock.rest.actions.listWorkflowRuns.mockRejectedValue(
        httpError(403, "Resource not accessible by integration"),
      );

      await expect(backend().getJobHistory("test", 5)).rejects.toMatchObject({ status: 403 });
    });
  });

  describe("findPullRequest", () => {
    it("does not guess a head owner when the head repository is unknown", async () => {
      mock.rest.repos.listPullRequestsAssociatedWithCommit.mockResolvedValue(ok([]));

      await expect(backend().findPullRequest(runInfo({ headRepoFullName: null }))).resolves.toBeNull();
      expect(mock.rest.pulls.list).not.toHaveBeenCalled();
    });

    it("returns null when the branch lookup fails", async () => {
      mock.rest.repos.listPullRequestsAssociatedWithCommit.mockResolvedValue(ok([]));
      mock.rest.pulls.list.mockRejectedValue(httpError(422));

      await expect(backend().findPullRequest(runInfo())).resolves.toBeNull();
    });
  });

  describe("findComment / upsertComment", () => {
    it("only matches the marker at the start of the body", async () => {
      mock.rest.issues.listComments.mockResolvedValue(
        ok([
          comment(1, `Copy of the bot's output:\n${MARKER}`, "2026-11-20T10:00:00Z"),
          comment(2, "<!-- ci-triage-agent", "2026-11-20T11:00:00Z"),
        ]),
      );

      await expect(backend().findComment(42, MARKER)).resolves.toBeNull();
    });

    it("picks the newest match by creation time, across pages and regardless of order", async () => {
      const filler = Array.from({ length: 100 }, (_, i) =>
        comment(100 + i, "chatter", "2026-11-18T00:00:00Z"),
      );
      mock.rest.issues.listComments
        .mockResolvedValueOnce(
          ok([comment(9, `${MARKER}\nnewest`, "2026-11-21T00:00:00Z"), ...filler.slice(1)]),
        )
        .mockResolvedValueOnce(ok([comment(8, `${MARKER}\nolder`, "2026-11-19T00:00:00Z")]));

      await expect(backend().findComment(42, MARKER)).resolves.toMatchObject({ id: 9 });
      expect(mock.rest.issues.listComments).toHaveBeenCalledTimes(2);
    });

    it("treats regex metacharacters in the marker literally", async () => {
      const marker = "<!-- ci-triage-agent:CI (push) [.*] -->";
      mock.rest.issues.listComments.mockResolvedValue(
        ok([
          comment(1, "<!-- ci-triage-agent:CI (push) [xx] -->\nother", "2026-11-20T10:00:00Z"),
          comment(2, `${marker}\nours`, "2026-11-19T10:00:00Z"),
        ]),
      );

      await expect(backend().findComment(42, marker)).resolves.toMatchObject({ id: 2 });
    });

    it("ignores marker comments written by outside users", async () => {
      mock.rest.issues.listComments.mockResolvedValue(
        ok([
          comment(1, `${MARKER}\nours`, "2026-11-19T10:00:00Z"),
          comment(2, `${MARKER}\nspoofed`, "2026-11-20T10:00:00Z", {
            user: { login: "drive-by", type: "User" },
            author_association: "NONE",
          }),
          comment(3, `${MARKER}\nspoofed`, "2026-11-20T11:00:00Z", {
            user: { login: "first-timer", type: "User" },
            author_association: "FIRST_TIME_CONTRIBUTOR",
          }),
          comment(4, `${MARKER}\nghost`, "2026-11-20T12:00:00Z", { user: null }),
        ]),
      );

      await expect(backend().findComment(42, MARKER)).resolves.toMatchObject({ id: 1 });
    });

    it("accepts a marker comment from a collaborator (a PAT owner)", async () => {
      mock.rest.issues.listComments.mockResolvedValue(
        ok([
          comment(5, `${MARKER}\nvia PAT`, "2026-11-20T10:00:00Z", {
            user: { login: "maintainer", type: "User" },
            author_association: "COLLABORATOR",
          }),
        ]),
      );

      await expect(backend().findComment(42, MARKER)).resolves.toMatchObject({ id: 5 });
    });

    it("creates its own comment instead of editing an outsider's marker comment", async () => {
      mock.rest.issues.listComments.mockResolvedValue(
        ok([
          comment(2, `${MARKER}\nspoofed`, "2026-11-20T10:00:00Z", {
            user: { login: "drive-by", type: "User" },
            author_association: "CONTRIBUTOR",
          }),
        ]),
      );
      mock.rest.issues.createComment.mockResolvedValue(ok(comment(6, "", "2026-11-20T12:00:00Z")));

      await expect(backend().upsertComment(42, MARKER, "triage")).resolves.toMatchObject({
        id: 6,
        created: true,
      });
      expect(mock.rest.issues.updateComment).not.toHaveBeenCalled();
    });

    it.each(["", "   \n"])("refuses a blank marker (%j) before touching any comment", async (marker) => {
      mock.rest.issues.listComments.mockResolvedValue(
        ok([comment(1, "someone's review", "2026-11-20T10:00:00Z")]),
      );
      const gateway = backend();

      await expect(gateway.findComment(42, marker)).rejects.toThrow("Comment marker must not be blank");
      await expect(gateway.upsertComment(42, marker, "body")).rejects.toThrow(
        "Comment marker must not be blank",
      );
      expect(mock.rest.issues.listComments).not.toHaveBeenCalled();
      expect(mock.rest.issues.updateComment).not.toHaveBeenCalled();
      expect(mock.rest.issues.createComment).not.toHaveBeenCalled();
    });

    it("prepends the marker only when the body does not already start with it", async () => {
      mock.rest.issues.listComments.mockResolvedValue(ok([]));
      mock.rest.issues.createComment.mockResolvedValue(ok(comment(6, "", "2026-11-20T12:00:00Z")));
      const gateway = backend();

      await gateway.upsertComment(42, MARKER, `\n  ${MARKER}\nbody`);
      await gateway.upsertComment(42, MARKER, `intro\n${MARKER}`);

      expect(mock.rest.issues.createComment.mock.calls.map(([p]) => (p as Params).body)).toEqual([
        `\n  ${MARKER}\nbody`,
        `${MARKER}\nintro\n${MARKER}`,
      ]);
    });
  });

  describe("retries", () => {
    it("retries network failures, which Octokit reports as status 500", async () => {
      const networkError = Object.assign(new Error("fetch failed"), { status: 500 });
      mock.rest.actions.getWorkflowRun
        .mockRejectedValueOnce(networkError)
        .mockResolvedValue(ok(workflowRun()));

      await expect(backend().getRun()).resolves.toMatchObject({ id: RUN_ID });
      expect(sleep).toHaveBeenCalledTimes(1);
    });

    it.each([
      ["a primary rate limit", httpError(403, "API rate limit exceeded", { "x-ratelimit-remaining": "0" })],
      ["a validation error", httpError(422, "Validation Failed")],
      ["a bad request", httpError(400)],
      ["an error without a status", new TypeError("boom")],
    ])("does not retry %s", async (_label, error) => {
      mock.rest.actions.getWorkflowRun.mockRejectedValue(error);

      await expect(backend().getRun()).rejects.toBe(error);
      expect(mock.rest.actions.getWorkflowRun).toHaveBeenCalledTimes(1);
      expect(sleep).not.toHaveBeenCalled();
    });

    it("caps a long retry-after and ignores one it cannot parse", async () => {
      mock.rest.actions.getWorkflowRun
        .mockRejectedValueOnce(httpError(429, "slow down", { "retry-after": "3600" }))
        .mockRejectedValueOnce(httpError(503, "busy", { "retry-after": "Wed, 25 Nov 2026 07:28:00 GMT" }))
        .mockResolvedValue(ok(workflowRun()));

      await expect(backend().getRun()).resolves.toMatchObject({ id: RUN_ID });
      expect(sleep.mock.calls).toEqual([[10_000], [2_000]]);
    });

    it("retries an idempotent comment update on 5xx", async () => {
      mock.rest.issues.listComments.mockResolvedValue(
        ok([comment(3, `${MARKER}\nold`, "2026-11-20T10:00:00Z")]),
      );
      mock.rest.issues.updateComment
        .mockRejectedValueOnce(httpError(502))
        .mockResolvedValue(ok(comment(3, "", "2026-11-20T10:00:00Z")));

      await expect(backend().upsertComment(42, MARKER, "new")).resolves.toMatchObject({
        id: 3,
        created: false,
      });
      expect(mock.rest.issues.updateComment).toHaveBeenCalledTimes(2);
    });
  });
});

describe("review fixes", () => {
  it("diffs the PR as of the failing commit when newer commits were pushed since", async () => {
    mock.rest.pulls.get.mockResolvedValue(
      ok({ head: { sha: "f".repeat(40) }, base: { sha: "b".repeat(40) } }),
    );
    mock.rest.repos.compareCommitsWithBasehead.mockResolvedValue(
      ok({
        files: [
          { filename: "src/a.ts", status: "modified", additions: 1, deletions: 1, patch: "@@ -1 +1 @@" },
        ],
      }),
    );

    const files = await backend().getChangedFiles();

    expect(files.map((f) => f.path)).toEqual(["src/a.ts"]);
    expect(mock.rest.repos.compareCommitsWithBasehead).toHaveBeenCalledWith(
      expect.objectContaining({ basehead: `${"b".repeat(40)}...${HEAD_SHA}` }),
    );
    expect(mock.rest.pulls.listFiles).not.toHaveBeenCalled();
  });

  it("reports the pinned triggering attempt and its own conclusion", async () => {
    mock.rest.actions.getWorkflowRun.mockResolvedValue(ok(workflowRun({ run_attempt: 3, conclusion: null })));
    const run = await createGitHubBackend(mock as unknown as Octokit, REPO, RUN_ID, {
      sleep,
      attempt: { attempt: 1, conclusion: "failure" },
    }).getRun();

    expect(run).toMatchObject({ attempt: 1, conclusion: "failure" });
  });
});
