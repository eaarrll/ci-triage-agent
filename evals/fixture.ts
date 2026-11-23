import type {
  Category,
  ChangedFile,
  JobHistoryEntry,
  JobInfo,
  RepoRef,
  RunInfo,
  TriageBackend,
} from "../src/types.js";

// CONTRACT STUB — implemented by the eval-harness owner.
//
// On-disk layout of one fixture (evals/fixtures/<id>/):
//   fixture.json        FixtureFile (below)
//   logs/<jobId>.log    raw job log exactly as GitHub serves it (timestamp-prefixed lines)
//   repo/<path>         repository tree at run.headSha (served by readFile/listDirectory at any ref
//                       equal to run.headSha; other refs fall back to base/<path> if present, else null)
//   base/<path>         optional: files as they are on the default branch, for ref === run.defaultBranch

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
  expected: FixtureExpectation;
}

export interface LoadedFixture {
  dir: string;
  file: FixtureFile;
}

export function loadFixtures(root: string, only?: string[]): LoadedFixture[] {
  void root;
  void only;
  throw new Error("not implemented");
}

/** TriageBackend served entirely from a fixture directory. Throws for unknown job ids. */
export function createFixtureBackend(fixture: LoadedFixture): TriageBackend {
  void fixture;
  throw new Error("not implemented");
}
