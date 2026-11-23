import type { getOctokit } from "@actions/github";
import type { CommentPort, RepoRef, TriageBackend } from "../types.js";

// CONTRACT STUB — implemented by the GitHub gateway owner.

export type Octokit = ReturnType<typeof getOctokit>;

/** TriageBackend + CommentPort over the GitHub REST API for one workflow run. */
export function createGitHubBackend(octokit: Octokit, repo: RepoRef, runId: number): TriageBackend & CommentPort {
  void octokit;
  void repo;
  void runId;
  throw new Error("not implemented");
}
