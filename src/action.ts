import * as core from "@actions/core";
import * as github from "@actions/github";
import { runTriage } from "./agent/agent.js";
import { readConfig } from "./config.js";
import { buildContext } from "./context.js";
import { createGitHubBackend } from "./github/gateway.js";
import { withRedaction } from "./redact.js";
import {
  commentMarker,
  isWrittenByNewerRun,
  renderComment,
  renderResolved,
  renderSummary,
} from "./report.js";
import { heuristicTriage } from "./signatures.js";
import type { AgentLogger, CommentPort, Config, ReportMeta, RunInfo, TriageResult } from "./types.js";
import { VERSION } from "./version.js";

const TRIAGE_CONCLUSIONS = new Set(["failure", "timed_out"]);

const logger: AgentLogger = {
  info: (msg) => core.info(msg),
  warning: (msg) => core.warning(msg),
  debug: (msg) => core.debug(msg),
};

export async function run(): Promise<void> {
  let config: Config;
  try {
    config = readConfig(
      { getInput: (name) => core.getInput(name) },
      {
        repo: github.context.repo,
        runId: github.context.runId,
        eventName: github.context.eventName,
        payload: github.context.payload as Record<string, unknown>,
      },
    );
  } catch (err) {
    // Bad inputs are the workflow author's to fix, so this is the one place we fail loudly.
    core.setOutput("mode", "error");
    core.setFailed(`ci-triage-agent: ${errorMessage(err)}`);
    return;
  }
  if (config.apiKey) core.setSecret(config.apiKey);

  try {
    await triage(config);
  } catch (err) {
    const msg = `ci-triage-agent could not complete: ${errorMessage(err)}`;
    if (config.failOnError) core.setFailed(msg);
    else core.warning(msg);
    core.setOutput("mode", "error");
  }
}

async function triage(config: Config): Promise<void> {
  const octokit = github.getOctokit(config.githubToken);
  const gateway = createGitHubBackend(octokit, config.repo, config.runId, { attempt: config.runAttempt });
  const backend = withRedaction(gateway);
  const run = await backend.getRun();
  core.info(
    `Triaging ${run.workflowName} run ${run.id} (attempt ${run.attempt}, ${run.conclusion ?? "in progress"})`,
  );

  if (run.conclusion === "success") {
    core.setOutput("mode", (await resolveEarlierComment(config, gateway, run)) ? "resolved" : "skipped");
    return;
  }
  if (run.conclusion !== null && !TRIAGE_CONCLUSIONS.has(run.conclusion)) {
    core.info(`Run concluded "${run.conclusion}"; nothing to triage.`);
    core.setOutput("mode", "skipped");
    return;
  }

  const ctx = await buildContext(backend, { maxFailedJobs: config.maxFailedJobs, logger });
  if (ctx.failedJobs.length === 0) {
    // In same-workflow mode (`if: always()`) the run is still in progress; no failed job so far
    // means the jobs this one depends on passed, which resolves an earlier triage.
    const resolved = run.conclusion === null && (await resolveEarlierComment(config, gateway, run));
    if (!resolved) core.info("No failed jobs found in this run; nothing to triage.");
    core.setOutput("mode", resolved ? "resolved" : "skipped");
    return;
  }

  // `if: always()` in the same workflow also runs when the run is being cancelled; cancelled
  // jobs explain nothing, so do not spend tokens or post a comment about them.
  if (run.conclusion === null && ctx.failedJobs.every((job) => job.job.conclusion === "cancelled")) {
    core.info("Only cancelled jobs so far (the run is being cancelled); nothing to triage.");
    core.setOutput("mode", "skipped");
    return;
  }

  const meta: ReportMeta = {
    run: ctx.run,
    repo: config.repo,
    mode: "heuristic",
    model: null,
    usage: null,
    trace: [],
    turns: 0,
    stopCause: null,
    redactions: 0,
    note: null,
    actionVersion: VERSION,
  };

  let result: TriageResult;
  if (config.apiKey) {
    const outcome = await runTriage(ctx, backend, {
      model: config.model,
      effort: config.effort,
      maxTurns: config.maxTurns,
      maxCostUsd: config.maxCostUsd,
      timeoutMs: config.timeoutSeconds * 1000,
      extraInstructions: config.extraInstructions,
      apiKey: config.apiKey,
      logger,
    });
    meta.usage = outcome.usage;
    meta.trace = outcome.trace;
    meta.turns = outcome.turns;
    if (outcome.status === "ok") {
      result = outcome.result;
      meta.mode = "agent";
      meta.model = outcome.modelUsed;
      meta.stopCause = outcome.stopCause;
    } else {
      core.warning(`AI analysis ${outcome.status}: ${outcome.message}. Falling back to heuristic triage.`);
      result = heuristicTriage(ctx);
      meta.note = `AI analysis ${outcome.status === "refused" ? "was declined" : "failed"}: ${outcome.message}`;
    }
  } else {
    result = heuristicTriage(ctx);
    meta.note = "no anthropic-api-key was provided";
  }
  meta.redactions = backend.redactionCount;

  // Outputs and the summary come first: they must survive a comment that cannot be posted.
  setResultOutputs(result, meta);
  await core.summary.addRaw(renderSummary(result, meta), true).write();

  if (!config.comment) return;
  try {
    const pr = await gateway.findPullRequest(ctx.run);
    if (pr === null) {
      core.info("Run is not associated with an open pull request; results are in the job summary.");
      return;
    }
    const url = await writeComment(gateway, pr, ctx.run, renderComment(result, meta));
    if (url) core.setOutput("comment-url", url);
  } catch (err) {
    // Typical cause: a read-only token (pull_request from a fork, or no pull-requests: write).
    core.warning(`Could not post the PR comment (results are in the job summary): ${errorMessage(err)}`);
  }
}

function setResultOutputs(result: TriageResult, meta: ReportMeta): void {
  core.setOutput("category", result.category);
  core.setOutput("confidence", result.confidence);
  core.setOutput("title", result.title);
  core.setOutput("root-cause", result.root_cause);
  core.setOutput("suggested-fix", result.suggested_fix);
  core.setOutput("flaky-suspected", String(result.flaky_suspected));
  core.setOutput("mode", meta.mode);
  core.setOutput("cost-usd", meta.usage?.costUsd != null ? meta.usage.costUsd.toFixed(4) : "");
  core.setOutput("comment-url", "");
  core.setOutput("result-json", JSON.stringify(result));
}

/**
 * Create or update this workflow's comment, unless a later run already wrote it (a slow
 * triage of an older run must not replace a newer result or a "Resolved" note).
 */
async function writeComment(
  gateway: CommentPort,
  pr: number,
  run: RunInfo,
  body: string,
): Promise<string | null> {
  const marker = commentMarker(run);
  const existing = await gateway.findComment(pr, marker);
  if (existing && isWrittenByNewerRun(existing, run)) {
    core.info(`A newer run already updated the triage comment (${existing.htmlUrl}); leaving it as is.`);
    return null;
  }
  if (existing && existing.body === body) return existing.htmlUrl;
  const posted = await gateway.upsertComment(pr, marker, body);
  core.info(`${posted.created ? "Posted" : "Updated"} triage comment: ${posted.htmlUrl}`);
  return posted.htmlUrl;
}

/** Returns true when an earlier triage comment was marked resolved. Never throws. */
async function resolveEarlierComment(config: Config, gateway: CommentPort, run: RunInfo): Promise<boolean> {
  if (!config.comment || !config.resolveOnSuccess) {
    core.info("Run succeeded; nothing to triage.");
    return false;
  }
  try {
    const pr = await gateway.findPullRequest(run);
    if (pr === null) {
      core.info("Run succeeded and is not associated with an open pull request.");
      return false;
    }
    const existing = await gateway.findComment(pr, commentMarker(run));
    if (existing === null) {
      core.info("Run succeeded and there is no earlier triage comment to resolve.");
      return false;
    }
    const url = await writeComment(gateway, pr, run, renderResolved(existing, run));
    if (url === null) return false;
    core.setOutput("comment-url", url);
    return true;
  } catch (err) {
    core.warning(`Could not update the earlier triage comment: ${errorMessage(err)}`);
    return false;
  }
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
