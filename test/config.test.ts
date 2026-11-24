import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ConfigError, readConfig } from "../src/config.js";
import type { GitHubEventContext, InputSource } from "../src/config.js";

// Obviously fake, but shaped like the real thing.
const FAKE_API_KEY = "sk-ant-api03-FAKE-KEY-FOR-TESTS-ONLY-000000000000000000000000";
const FAKE_TOKEN = "ghp_FAKEFAKEFAKEFAKEFAKEFAKEFAKEFAKEFAKE";

function inputs(values: Record<string, string>): InputSource {
  return { getInput: (name) => values[name] ?? "" };
}

function withToken(values: Record<string, string> = {}): InputSource {
  return inputs({ "github-token": FAKE_TOKEN, ...values });
}

function gh(overrides: Partial<GitHubEventContext> = {}): GitHubEventContext {
  return {
    repo: { owner: "example-org", repo: "widgets" },
    runId: 1001,
    eventName: "push",
    payload: {},
    ...overrides,
  };
}

function errorOf(fn: () => unknown): Error {
  try {
    fn();
  } catch (error) {
    if (error instanceof Error) return error;
    throw new Error(`threw a non-Error: ${String(error)}`, { cause: error });
  }
  throw new Error("expected the call to throw");
}

describe("readConfig defaults", () => {
  it("fills every default when only the token is set", () => {
    expect(readConfig(withToken(), gh())).toEqual({
      apiKey: null,
      githubToken: FAKE_TOKEN,
      model: "claude-opus-5-5",
      effort: "medium",
      repo: { owner: "example-org", repo: "widgets" },
      runId: 1001,
      runAttempt: null,
      comment: true,
      resolveOnSuccess: true,
      maxTurns: 12,
      maxCostUsd: 0.5,
      timeoutSeconds: 300,
      maxFailedJobs: 4,
      failOnError: false,
      extraInstructions: null,
    });
  });

  it("treats an empty or blank API key as heuristic mode and trims a real one", () => {
    expect(readConfig(withToken({ "anthropic-api-key": "   " }), gh()).apiKey).toBeNull();
    expect(readConfig(withToken({ "anthropic-api-key": ` ${FAKE_API_KEY}\n` }), gh()).apiKey).toBe(
      FAKE_API_KEY,
    );
  });

  it("reads every input when they are all set", () => {
    const config = readConfig(
      withToken({
        "anthropic-api-key": FAKE_API_KEY,
        model: "  claude-sonnet-4-5@20250929 ",
        effort: "xhigh",
        "run-id": "555",
        comment: "no",
        "resolve-on-success": "off",
        "max-turns": "50",
        "max-cost-usd": "20",
        "timeout-seconds": "1800",
        "max-failed-jobs": "10",
        "fail-on-error": "yes",
        "extra-instructions": "  Tests live in packages/*/test.  ",
      }),
      gh(),
    );
    expect(config).toMatchObject({
      apiKey: FAKE_API_KEY,
      model: "claude-sonnet-4-5@20250929",
      effort: "xhigh",
      runId: 555,
      comment: false,
      resolveOnSuccess: false,
      maxTurns: 50,
      maxCostUsd: 20,
      timeoutSeconds: 1800,
      maxFailedJobs: 10,
      failOnError: true,
      extraInstructions: "Tests live in packages/*/test.",
    });
  });

  it("does not share the repo object with the event context", () => {
    const context = gh();
    const config = readConfig(withToken(), context);
    expect(config.repo).toEqual(context.repo);
    expect(config.repo).not.toBe(context.repo);
  });
});

describe("readConfig validation", () => {
  it("requires github-token", () => {
    const error = errorOf(() => readConfig(inputs({ "anthropic-api-key": FAKE_API_KEY }), gh()));
    expect(error).toBeInstanceOf(ConfigError);
    expect(error.message).toContain('"github-token"');
    expect(error.message).toContain("required");
  });

  it("accepts model IDs with provider-style punctuation and rejects anything else", () => {
    for (const model of [
      "claude-opus-5-5",
      "us.anthropic.claude-opus-5-5:0",
      "claude-x@20250101",
      "org/model_v1",
    ]) {
      expect(readConfig(withToken({ model }), gh()).model).toBe(model);
    }
    for (const model of ["claude opus", "claude;rm -rf", "$(whoami)", "model\nnext", "é"]) {
      const error = errorOf(() => readConfig(withToken({ model }), gh()));
      expect(error.message).toMatch(/Invalid input "model": expected a model ID/);
    }
  });

  it("accepts each effort level case-insensitively and lists them on error", () => {
    for (const effort of ["low", "medium", "high", "xhigh", "max"] as const) {
      expect(readConfig(withToken({ effort: effort.toUpperCase() }), gh()).effort).toBe(effort);
    }
    const error = errorOf(() => readConfig(withToken({ effort: "extreme" }), gh()));
    expect(error.message).toBe('Invalid input "effort": expected one of low, medium, high, xhigh, max.');
  });

  it.each([
    ["true", true],
    ["TRUE", true],
    ["Yes", true],
    ["on", true],
    ["1", true],
    ["false", false],
    ["False", false],
    ["NO", false],
    ["off", false],
    ["0", false],
  ])("parses the boolean %s as %s", (raw, expected) => {
    const config = readConfig(
      withToken({ comment: raw, "resolve-on-success": raw, "fail-on-error": raw }),
      gh(),
    );
    expect([config.comment, config.resolveOnSuccess, config.failOnError]).toEqual([
      expected,
      expected,
      expected,
    ]);
  });

  it.each(["comment", "resolve-on-success", "fail-on-error"])("rejects a non-boolean %s", (input) => {
    const error = errorOf(() => readConfig(withToken({ [input]: "maybe" }), gh()));
    expect(error.message).toBe(
      `Invalid input "${input}": expected one of true, yes, on, 1, false, no, off, 0 (case-insensitive).`,
    );
  });

  it.each([
    ["max-turns", "1..50", ["0", "51", "-1", "1.5", "1e1", "twelve", "0x10"], ["1", "50", "007"]],
    ["timeout-seconds", "30..1800", ["29", "1801", "300s", "3.0e2"], ["30", "1800"]],
    ["max-failed-jobs", "1..10", ["0", "11", "+4", "4 jobs"], ["1", "10"]],
  ] as const)("validates the integer %s in %s", (input, _range, bad, good) => {
    for (const value of bad) {
      const error = errorOf(() => readConfig(withToken({ [input]: value }), gh()));
      expect(error).toBeInstanceOf(ConfigError);
      expect(error.message).toMatch(
        new RegExp(`^Invalid input "${input}": expected an integer from \\d+ to \\d+\\.$`),
      );
    }
    for (const value of good) {
      expect(() => readConfig(withToken({ [input]: value }), gh())).not.toThrow();
    }
  });

  it("validates max-cost-usd as a plain positive decimal up to 20", () => {
    const cost = (value: string): number => readConfig(withToken({ "max-cost-usd": value }), gh()).maxCostUsd;
    expect(cost("0.25")).toBe(0.25);
    expect(cost(".5")).toBe(0.5);
    expect(cost("3.")).toBe(3);
    expect(cost("20")).toBe(20);
    for (const value of ["0", "0.0", "-1", "20.01", "1e1", "Infinity", "NaN", "$1", "1,5", "0x1"]) {
      const error = errorOf(() => cost(value));
      expect(error.message).toBe(
        'Invalid input "max-cost-usd": expected a number of US dollars greater than 0 and at most 20.',
      );
    }
  });

  it("trims extra-instructions, maps empty to null and caps at 4000 characters", () => {
    const extra = (value: string): string | null =>
      readConfig(withToken({ "extra-instructions": value }), gh()).extraInstructions;
    expect(extra("   ")).toBeNull();
    expect(extra("\n  Use pnpm.  \n")).toBe("Use pnpm.");
    expect(extra("x".repeat(5000))).toHaveLength(4000);
    // A cut through an emoji drops the dangling half instead of keeping a lone surrogate.
    expect(extra(`${"x".repeat(3999)}😀tail`)).toBe("x".repeat(3999));
  });
});

describe("run-id resolution", () => {
  const workflowRun = { eventName: "workflow_run", payload: { workflow_run: { id: 9001 } } };

  it("prefers the run-id input over everything else", () => {
    expect(readConfig(withToken({ "run-id": "777" }), gh(workflowRun)).runId).toBe(777);
  });

  it("uses the triggering run for workflow_run events", () => {
    expect(readConfig(withToken(), gh(workflowRun)).runId).toBe(9001);
  });

  it("ignores a workflow_run payload on other events and uses the current run", () => {
    expect(
      readConfig(withToken(), gh({ eventName: "pull_request", payload: workflowRun.payload })).runId,
    ).toBe(1001);
  });

  it("refuses to fall back to the current run when a workflow_run payload has no id", () => {
    for (const payload of [
      {},
      { workflow_run: null },
      { workflow_run: { id: "9001" } },
      { workflow_run: { id: 0 } },
    ]) {
      const error = errorOf(() => readConfig(withToken(), gh({ eventName: "workflow_run", payload })));
      expect(error.message).toContain("workflow_run.id");
    }
  });

  it("trims the run-id input and rejects a fractional or zero triggering run", () => {
    expect(readConfig(withToken({ "run-id": " 42\n" }), gh()).runId).toBe(42);
    for (const id of [9001.5, -1, Number.MAX_SAFE_INTEGER + 2]) {
      const payload = { workflow_run: { id } };
      const error = errorOf(() => readConfig(withToken(), gh({ eventName: "workflow_run", payload })));
      expect(error).toBeInstanceOf(ConfigError);
    }
    expect(errorOf(() => readConfig(withToken(), gh({ runId: 0 })))).toBeInstanceOf(ConfigError);
  });

  it("rejects an invalid run-id input", () => {
    for (const value of ["0", "-5", "12.5", "abc", "99999999999999999999"]) {
      const error = errorOf(() => readConfig(withToken({ "run-id": value }), gh()));
      expect(error.message).toBe('Invalid input "run-id": expected a positive integer (a workflow run ID).');
    }
  });

  it("fails clearly when no run can be determined", () => {
    const error = errorOf(() => readConfig(withToken(), gh({ runId: Number.NaN })));
    expect(error.message).toContain("set the run-id input");
  });
});

describe("secrets in error messages", () => {
  const secretInputs = [
    "model",
    "effort",
    "run-id",
    "comment",
    "resolve-on-success",
    "max-turns",
    "max-cost-usd",
    "timeout-seconds",
    "max-failed-jobs",
    "fail-on-error",
  ];

  it.each(secretInputs)("never echoes a secret pasted into %s", (input) => {
    // The suffixes make each value invalid for every input, including the permissive model ID.
    for (const secret of [`${FAKE_API_KEY} x`, `${FAKE_TOKEN}!`]) {
      const error = errorOf(() =>
        readConfig(
          inputs({ "anthropic-api-key": FAKE_API_KEY, "github-token": FAKE_TOKEN, [input]: secret }),
          gh(),
        ),
      );
      expect(error.message).toContain(`"${input}"`);
      expect(error.message).not.toContain(FAKE_API_KEY);
      expect(error.message).not.toContain(FAKE_TOKEN);
      expect(error.message).not.toContain("FAKE");
    }
  });

  it("does not echo the API key when the token is missing", () => {
    const error = errorOf(() => readConfig(inputs({ "anthropic-api-key": FAKE_API_KEY }), gh()));
    expect(error.message).not.toContain(FAKE_API_KEY);
  });
});

// ---------------------------------------------------------------------------
// action.yml must describe exactly what readConfig reads
// ---------------------------------------------------------------------------

interface YamlEntry {
  [key: string]: string;
}

interface ActionMetadata {
  top: Map<string, string>;
  inputs: Map<string, YamlEntry>;
  outputs: Map<string, YamlEntry>;
}

function unquote(value: string): string {
  const match = /^(["'])(.*)\1$/.exec(value.trim());
  return match ? (match[2] ?? "") : value.trim();
}

/** Just enough YAML for action.yml: two levels of maps, scalars and folded (>-) descriptions. */
function parseActionMetadata(text: string): ActionMetadata {
  const metadata: ActionMetadata = { top: new Map(), inputs: new Map(), outputs: new Map() };
  let section = "";
  let entry: YamlEntry | undefined;
  let field = "";
  for (const line of text.split(/\r?\n/)) {
    if (line.trim() === "" || line.trim().startsWith("#")) continue;
    const indent = line.length - line.trimStart().length;
    if (indent >= 6 && entry) {
      entry[field] = `${entry[field] ?? ""} ${line.trim()}`.trim();
      continue;
    }
    const match = /^\s*([A-Za-z0-9_-]+):\s*(.*)$/.exec(line);
    if (!match) throw new Error(`unparsed action.yml line: ${line}`);
    const key = match[1] ?? "";
    const value = match[2] ?? "";
    if (indent === 0) {
      section = key;
      metadata.top.set(key, unquote(value));
    } else if (indent === 2 && (section === "inputs" || section === "outputs")) {
      entry = {};
      metadata[section].set(key, entry);
    } else if (indent === 2) {
      metadata.top.set(`${section}.${key}`, unquote(value));
    } else if (indent === 4 && entry) {
      field = key;
      entry[key] = value === ">-" ? "" : unquote(value);
    }
  }
  return metadata;
}

describe("action.yml", () => {
  const metadata = parseActionMetadata(readFileSync(new URL("../action.yml", import.meta.url), "utf8"));

  it("declares exactly the inputs readConfig reads", () => {
    const asked: string[] = [];
    readConfig(
      {
        getInput: (name) => {
          asked.push(name);
          return name === "github-token" ? FAKE_TOKEN : "";
        },
      },
      gh(),
    );
    expect(new Set(asked).size).toBe(asked.length);
    expect([...asked].sort()).toEqual([...metadata.inputs.keys()].sort());
  });

  it("documents defaults that match the code's defaults", () => {
    const yamlDefaults = Object.fromEntries(
      [...metadata.inputs].map(([name, entry]) => [name, entry["default"] ?? ""]),
    );
    expect(yamlDefaults["github-token"]).toBe("${{ github.token }}");
    // The runner expands the expression; any non-empty token stands in for it.
    const fromYaml = readConfig(inputs({ ...yamlDefaults, "github-token": FAKE_TOKEN }), gh());
    expect(fromYaml).toEqual(readConfig(withToken(), gh()));
  });

  it("describes every input and marks only the token as required", () => {
    for (const [name, entry] of metadata.inputs) {
      expect(entry["description"], name).toMatch(/\S{3,}/);
      expect(entry["required"], name).toBe(name === "github-token" ? "true" : "false");
    }
    expect(metadata.inputs.get("anthropic-api-key")?.["description"]).toMatch(/heuristic mode/);
  });

  it("declares the documented outputs", () => {
    expect([...metadata.outputs.keys()]).toEqual([
      "category",
      "confidence",
      "title",
      "root-cause",
      "suggested-fix",
      "flaky-suspected",
      "mode",
      "cost-usd",
      "comment-url",
      "result-json",
    ]);
    for (const [name, entry] of metadata.outputs) expect(entry["description"], name).toMatch(/\S{3,}/);
  });

  it("has Marketplace-ready metadata and runs on node24", () => {
    const description = metadata.top.get("description") ?? "";
    expect(metadata.top.get("name")).toBe("CI Triage Agent");
    expect(description).toBe(
      "AI agent that investigates failed CI runs and posts the root cause, evidence and fix on the pull request.",
    );
    expect(description.length).toBeLessThanOrEqual(125);
    expect(metadata.top.get("author")).toBe("eaarrll");
    expect(metadata.top.get("branding.icon")).toBe("search");
    expect(metadata.top.get("branding.color")).toBe("red");
    expect(metadata.top.get("runs.using")).toBe("node24");
    expect(metadata.top.get("runs.main")).toBe("dist/index.js");
  });
});

describe("run attempt pinning (workflow_run)", () => {
  const wfRun = (workflowRun: Record<string, unknown>): GitHubEventContext => ({
    ...gh(),
    eventName: "workflow_run",
    payload: { workflow_run: workflowRun },
  });

  it("pins the triggering attempt and its conclusion", () => {
    const config = readConfig(withToken(), wfRun({ id: 77, run_attempt: 2, conclusion: "failure" }));
    expect(config.runId).toBe(77);
    expect(config.runAttempt).toEqual({ attempt: 2, conclusion: "failure" });
  });

  it("does not pin when run-id is given explicitly or the event is not workflow_run", () => {
    expect(
      readConfig(withToken({ "run-id": "77" }), wfRun({ id: 77, run_attempt: 2 })).runAttempt,
    ).toBeNull();
    expect(readConfig(withToken(), gh()).runAttempt).toBeNull();
  });
});
