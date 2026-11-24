import { existsSync, readdirSync, readFileSync, statSync, type Stats } from "node:fs";
import { readFile, readdir, realpath, stat } from "node:fs/promises";
import { basename, isAbsolute, join, relative, resolve, sep } from "node:path";
import { z } from "zod";
import { CATEGORIES } from "../src/types.js";
import type {
  Category,
  ChangedFile,
  JobHistoryEntry,
  JobInfo,
  RepoRef,
  RunInfo,
  TriageBackend,
} from "../src/types.js";

// On-disk layout of one fixture (evals/fixtures/<id>/):
//   fixture.json        FixtureFile (below)
//   logs/<jobId>.log    raw job log exactly as GitHub serves it (timestamp-prefixed lines);
//                       required for every job whose conclusion is "failure" or "timed_out",
//                       unless the job is listed in unavailableLogs
//   repo/<path>         repository tree at run.headSha (served for ref === run.headSha or "HEAD")
//   base/<path>         optional: files as they are on the default branch. For ref === run.defaultBranch,
//                       base/<path> wins and repo/<path> is the fallback, so base/ only needs the files
//                       the change touched. Any other ref serves nothing (null).

export interface FixtureExpectation {
  /** Any of these is accepted as correct. */
  categories: Category[];
  /** Every group must have at least one case-insensitive match in title + root_cause + suggested_fix. */
  keywords: string[][];
  /** Must not appear (case-insensitive) anywhere in the serialized result, e.g. prompt-injection canaries. */
  forbidden?: string[];
  /** When set, result.flaky_suspected must equal it. */
  flaky?: boolean;
  /** When set, fix_location.path must equal it or the suggested_fix must mention it. */
  fixPath?: string;
  /**
   * When set, result.confidence must not exceed it. For calibration cases the evidence cannot settle:
   * "low" when there is no information at all, "medium" when several causes fit equally well.
   */
  maxConfidence?: "low" | "medium";
}

export interface FixtureFile {
  id: string;
  title: string;
  /** What the scenario exercises and why the expected answer is right. */
  description: string;
  repo: RepoRef;
  run: RunInfo;
  jobs: JobInfo[];
  changedFiles: ChangedFile[];
  /** jobName -> history entries, newest first */
  history: Record<string, JobHistoryEntry[]>;
  /** Job ids whose log download fails as on GitHub (404/410), e.g. a job that never started. */
  unavailableLogs?: number[];
  expected: FixtureExpectation;
}

export interface LoadedFixture {
  dir: string;
  file: FixtureFile;
}

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

const nonEmpty = z.string().min(1);
const nullableString = z.string().nullable();
const idSchema = z.number().int().nonnegative();

const repoRefSchema = z.object({ owner: nonEmpty, repo: nonEmpty });

const runInfoSchema = z.object({
  id: idSchema,
  attempt: z.number().int().positive(),
  workflowId: idSchema,
  workflowName: z.string(),
  workflowPath: nullableString,
  event: nonEmpty,
  headBranch: nullableString,
  headSha: nonEmpty,
  headRepoFullName: nullableString,
  isFork: z.boolean(),
  defaultBranch: nonEmpty,
  conclusion: nullableString,
  htmlUrl: z.string(),
  displayTitle: nullableString,
  pullRequestNumbers: z.array(z.number().int().positive()),
  createdAt: z.string(),
});

const stepInfoSchema = z.object({
  number: z.number().int(),
  name: z.string(),
  status: z.string(),
  conclusion: nullableString,
  startedAt: nullableString,
  completedAt: nullableString,
});

const jobInfoSchema = z.object({
  id: idSchema,
  name: nonEmpty,
  status: z.string(),
  conclusion: nullableString,
  startedAt: nullableString,
  completedAt: nullableString,
  runnerLabels: z.array(z.string()),
  htmlUrl: nullableString,
  steps: z.array(stepInfoSchema),
});

const changedFileSchema = z.object({
  path: nonEmpty,
  status: nonEmpty,
  additions: z.number().int().nonnegative(),
  deletions: z.number().int().nonnegative(),
  patch: nullableString,
  previousPath: nullableString,
});

const jobHistoryEntrySchema = z.object({
  runId: idSchema,
  attempt: z.number().int().positive(),
  headSha: nonEmpty,
  branch: nullableString,
  event: z.string(),
  conclusion: nullableString,
  createdAt: z.string(),
  sameSha: z.boolean(),
  htmlUrl: nullableString,
});

// Strict: a misspelled optional key ("fixpath") would otherwise be dropped and silently weaken grading.
const expectationSchema = z.strictObject({
  categories: z.array(z.enum(CATEGORIES)).min(1),
  keywords: z.array(z.array(nonEmpty).min(1)),
  forbidden: z.array(nonEmpty).optional(),
  flaky: z.boolean().optional(),
  fixPath: nonEmpty.optional(),
  maxConfidence: z.enum(["low", "medium"]).optional(),
});

const fixtureFileSchema = z.object({
  id: z.string().regex(/^[a-z0-9][a-z0-9._-]*$/, "use lowercase letters, digits, '.', '_' or '-'"),
  title: nonEmpty,
  description: nonEmpty,
  repo: repoRefSchema,
  run: runInfoSchema,
  jobs: z.array(jobInfoSchema).min(1),
  changedFiles: z.array(changedFileSchema),
  history: z.record(z.string(), z.array(jobHistoryEntrySchema)),
  unavailableLogs: z.array(idSchema).optional(),
  expected: expectationSchema,
});

// Compile-time guard: the schema must describe exactly FixtureFile, so the two cannot drift apart.
type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
const _schemaMatchesFixtureFile: Same<z.infer<typeof fixtureFileSchema>, FixtureFile> = true;

// ---------------------------------------------------------------------------
// Loading
// ---------------------------------------------------------------------------

const FAILED_CONCLUSIONS: ReadonlySet<string> = new Set(["failure", "timed_out"]);

/** Loads and validates every fixture under `root`, sorted by id; `only` restricts to those ids. */
export function loadFixtures(root: string, only?: string[]): LoadedFixture[] {
  if (!existsSync(root) || !statSync(root).isDirectory()) {
    throw new Error(`Fixture root ${root} is not a directory`);
  }

  const fixtures = readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && existsSync(join(root, entry.name, "fixture.json")))
    .map((entry) => loadFixture(join(root, entry.name)))
    .sort((a, b) => compareStrings(a.file.id, b.file.id));

  assertUniqueIds(fixtures);
  return only === undefined ? fixtures : selectFixtures(fixtures, only);
}

function loadFixture(dir: string): LoadedFixture {
  const name = basename(dir);
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(join(dir, "fixture.json"), "utf8"));
  } catch (err) {
    throw new Error(`Fixture ${name}: fixture.json is not valid JSON (${errorMessage(err)})`, { cause: err });
  }

  const parsed = fixtureFileSchema.safeParse(raw);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .slice(0, 5)
      .map((issue) => `${formatPath(issue.path)}: ${issue.message}`)
      .join("; ");
    throw new Error(`Fixture ${name}: invalid fixture.json at ${issues}`);
  }

  const file = parsed.data;
  const unavailable = new Set(file.unavailableLogs ?? []);
  for (const id of unavailable) {
    if (!file.jobs.some((job) => job.id === id)) {
      throw new Error(`Fixture ${name}: unavailableLogs lists ${id}, which is not a job of the run`);
    }
    if (existsSync(join(dir, "logs", `${id}.log`))) {
      throw new Error(`Fixture ${name}: job ${id} is in unavailableLogs but has logs/${id}.log`);
    }
  }
  for (const job of file.jobs) {
    if (unavailable.has(job.id)) continue;
    if (job.conclusion !== null && FAILED_CONCLUSIONS.has(job.conclusion)) {
      const logPath = join(dir, "logs", `${job.id}.log`);
      if (!existsSync(logPath)) {
        throw new Error(`Fixture ${name}: failed job "${job.name}" (id ${job.id}) has no logs/${job.id}.log`);
      }
    }
  }
  return { dir, file };
}

function assertUniqueIds(fixtures: LoadedFixture[]): void {
  for (let i = 1; i < fixtures.length; i++) {
    const [prev, cur] = [fixtures[i - 1], fixtures[i]];
    if (prev && cur && prev.file.id === cur.file.id) {
      throw new Error(
        `Fixture id "${cur.file.id}" is used by both ${basename(prev.dir)} and ${basename(cur.dir)}`,
      );
    }
  }
}

function selectFixtures(fixtures: LoadedFixture[], only: string[]): LoadedFixture[] {
  const known = new Set(fixtures.map((f) => f.file.id));
  const unknown = only.filter((wanted) => !known.has(wanted));
  if (unknown.length > 0) {
    throw new Error(
      `Unknown fixture id(s): ${unknown.join(", ")}. Available: ${[...known].join(", ") || "none"}`,
    );
  }
  const wanted = new Set(only);
  return fixtures.filter((f) => wanted.has(f.file.id));
}

function formatPath(path: readonly PropertyKey[]): string {
  if (path.length === 0) return "(root)";
  return path
    .map((key, i) => (typeof key === "number" ? `[${key}]` : `${i === 0 ? "" : "."}${String(key)}`))
    .join("");
}

// ---------------------------------------------------------------------------
// Backend
// ---------------------------------------------------------------------------

/** TriageBackend served entirely from a fixture directory. Throws for unknown job ids. */
export function createFixtureBackend(fixture: LoadedFixture): TriageBackend {
  const { dir, file } = fixture;
  const repoTree = join(dir, "repo");
  const baseTree = join(dir, "base");

  // Trees to consult for a ref, highest priority first.
  const treesFor = (ref: string): string[] => {
    if (ref === file.run.headSha || ref === "HEAD") return [repoTree];
    if (ref === file.run.defaultBranch) return [baseTree, repoTree];
    return [];
  };

  return {
    repo: { ...file.repo },

    // Clones keep a consumer that mutates what it receives from corrupting later repeats.
    getRun: async () => structuredClone(file.run),
    listJobs: async () => structuredClone(file.jobs),
    getChangedFiles: async () => structuredClone(file.changedFiles),

    async getJobLog(jobId) {
      const job = file.jobs.find((j) => j.id === jobId);
      if (job === undefined) {
        throw new Error(`Fixture ${file.id}: no job with id ${jobId}`);
      }
      if (file.unavailableLogs?.includes(jobId)) {
        // The GitHub gateway's message for a 404/410 log download.
        throw new Error(`Logs for job ${jobId} are unavailable (expired or deleted)`);
      }
      try {
        return await readFile(join(dir, "logs", `${jobId}.log`), "utf8");
      } catch (err) {
        // Mirrors GitHub, which also fails (404/410) for jobs whose logs expired or never uploaded.
        throw new Error(`Fixture ${file.id}: log for job "${job.name}" (id ${jobId}) is not available`, {
          cause: err,
        });
      }
    },

    async readFile(path, ref) {
      const rel = normalizeRepoPath(path);
      if (rel === null || rel === "") return null;
      for (const tree of treesFor(ref)) {
        const entry = await statInside(tree, rel);
        if (entry === null) continue;
        return entry.stats.isFile() ? readFile(entry.abs, "utf8") : null;
      }
      return null;
    },

    async listDirectory(path, ref) {
      const rel = path === "/" ? "" : normalizeRepoPath(path);
      if (rel === null) return null;
      const names = new Set<string>();
      let found = false;
      // The default branch view is base/ overlaid on repo/, matching readFile's per-file fallback.
      for (const tree of treesFor(ref)) {
        const entry = await statInside(tree, rel);
        if (entry === null || !entry.stats.isDirectory()) continue;
        found = true;
        for (const dirent of await readdir(entry.abs, { withFileTypes: true })) {
          if (dirent.isDirectory()) names.add(`${dirent.name}/`);
          else if (dirent.isFile()) names.add(dirent.name);
        }
      }
      return found ? [...names].sort(compareStrings) : null;
    },

    async getJobHistory(jobName, limit) {
      if (!Object.hasOwn(file.history, jobName)) return [];
      return structuredClone((file.history[jobName] ?? []).slice(0, Math.max(0, limit)));
    },
  };
}

/**
 * Normalizes a repo-relative path to "a/b/c" ("" = repo root). Returns null for anything that could
 * escape the tree or that GitHub would never serve: absolute paths, ".." segments, backslashes, NUL.
 */
export function normalizeRepoPath(path: string): string | null {
  if (path.includes("\0") || path.includes("\\")) return null;
  if (isAbsolute(path) || /^[a-zA-Z]:/.test(path)) return null;
  const segments = path.split("/").filter((s) => s !== "" && s !== ".");
  if (segments.includes("..")) return null;
  return segments.join("/");
}

/**
 * Stats `rel` under `tree`, or null if it is missing, differs in letter case from what is on disk, or
 * resolves (e.g. via a symlink) outside the tree.
 */
async function statInside(tree: string, rel: string): Promise<{ abs: string; stats: Stats } | null> {
  const candidate = resolve(tree, rel);
  try {
    const [realTree, realCandidate] = await Promise.all([realpath(tree), realpath(candidate)]);
    if (!isWithin(realTree, realCandidate) || !(await hasExactCase(tree, rel))) return null;
    return { abs: realCandidate, stats: await stat(realCandidate) };
  } catch {
    return null;
  }
}

/**
 * GitHub paths are case-sensitive, but macOS and Windows disks are not: without this check "readme.md"
 * would open README.md and an eval run on a laptop would be more forgiving than production.
 */
async function hasExactCase(tree: string, rel: string): Promise<boolean> {
  let dir = tree;
  for (const segment of rel === "" ? [] : rel.split("/")) {
    if (!(await readdir(dir)).includes(segment)) return false;
    dir = join(dir, segment);
  }
  return true;
}

function isWithin(root: string, target: string): boolean {
  const rel = relative(root, target);
  return rel === "" || (!rel.startsWith(`..${sep}`) && rel !== ".." && !isAbsolute(rel));
}

function compareStrings(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
