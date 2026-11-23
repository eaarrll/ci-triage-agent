import { describe, expect, it } from "vitest";
import {
  commentMarker,
  fixLocationUrl,
  renderComment,
  renderResolved,
  renderSummary,
  sanitizeModelText,
} from "../src/report.js";
import type {
  Category,
  ReportMeta,
  RunInfo,
  ToolCallTrace,
  TriageEvidence,
  TriageResult,
} from "../src/types.js";

const ZWSP = "\u200b";
const SHA = "0123456789abcdef0123456789abcdef01234567";
const REPO = { owner: "example-org", repo: "widgets" };
const RUN_URL = "https://github.com/example-org/widgets/actions/runs/4242";

function makeRun(overrides: Partial<RunInfo> = {}): RunInfo {
  return {
    id: 4242,
    attempt: 2,
    workflowId: 77,
    workflowName: "CI",
    workflowPath: ".github/workflows/ci.yml",
    event: "pull_request",
    headBranch: "feature/discounts",
    headSha: SHA,
    headRepoFullName: "example-org/widgets",
    isFork: false,
    defaultBranch: "main",
    conclusion: "failure",
    htmlUrl: RUN_URL,
    displayTitle: "Add discounts",
    pullRequestNumbers: [7],
    createdAt: "2026-11-20T10:00:00Z",
    ...overrides,
  };
}

function makeResult(overrides: Partial<TriageResult> = {}): TriageResult {
  return {
    category: "code",
    title: "applyDiscount() now rounds before subtracting",
    root_cause: "The change in src/pricing/discount.ts rounds the unit price before applying the discount.",
    evidence: [
      { job: "test (node 24)", line: 412, excerpt: "AssertionError: expected 9.99 to equal 9.98" },
      { job: "lint", line: null, excerpt: "src/pricing/discount.ts: 1 warning" },
    ],
    suggested_fix: "Round after subtracting:\n\n```ts\nreturn round(price - discount);\n```",
    fix_location: { path: "src/pricing/discount.ts", line: 12 },
    confidence: "high",
    flaky_suspected: false,
    rerun_recommended: false,
    ...overrides,
  };
}

function trace(count: number): ToolCallTrace[] {
  return Array.from({ length: count }, (_, i) => ({
    turn: i + 1,
    name: "search_log",
    input: { job: "test (node 24)", pattern: "AssertionError" },
    ok: true,
    resultChars: 1234,
    durationMs: 56,
  }));
}

function makeMeta(overrides: Partial<ReportMeta> = {}): ReportMeta {
  return {
    run: makeRun(),
    repo: REPO,
    mode: "agent",
    model: "claude-opus-5-5",
    usage: {
      requests: 4,
      inputTokens: 12345,
      outputTokens: 2100,
      cacheReadTokens: 30000,
      cacheWriteTokens: 5000,
      costUsd: 0.1234,
    },
    trace: trace(3),
    turns: 4,
    stopCause: "complete",
    redactions: 2,
    note: null,
    actionVersion: "v1.2.3",
    ...overrides,
  };
}

/** Raw (unescaped) HTML tags or comments outside code — what GitHub would render as HTML. */
function rawHtml(markdown: string): string[] {
  const outsideCode = markdown
    .replace(/^(`{3,}|~{3,})[^\n]*\n[\s\S]*?^\1[ \t]*$/gm, "")
    .replace(/(?<!\\)(?:\\\\)*\\`/g, "")
    .replace(/(`+)(?!`)[^\n]*?(?<!`)\1(?!`)/g, "");
  return outsideCode.match(/<[A-Za-z!/][^>]*>?/g) ?? [];
}

const countOf = (text: string, needle: string): number => text.split(needle).length - 1;

// ---------------------------------------------------------------------------
// sanitizeModelText
// ---------------------------------------------------------------------------

describe("sanitizeModelText: mentions and references", () => {
  it("neutralizes user and team mentions", () => {
    expect(sanitizeModelText("ping @octocat and @example-org/platform-team")).toBe(
      `ping @${ZWSP}octocat and @${ZWSP}example-org/platform-team`,
    );
    expect(sanitizeModelText("@octocat at the start")).toBe(`@${ZWSP}octocat at the start`);
    expect(sanitizeModelText("(@octocat)")).toBe(`(@${ZWSP}octocat)`);
  });

  it("leaves email addresses alone", () => {
    expect(sanitizeModelText("mail dev@example.com or first.last@acme.example")).toBe(
      "mail dev@example.com or first.last@acme.example",
    );
  });

  it("does not let entities smuggle a mention", () => {
    const out = sanitizeModelText("&#64;octocat");
    expect(out).toBe(`&amp;#${ZWSP}64;octocat`);
  });

  it("breaks issue and cross-repo references", () => {
    expect(sanitizeModelText("fixes #123 and example-org/other#4")).toBe(
      `fixes #${ZWSP}123 and example-org/other#${ZWSP}4`,
    );
  });

  it("does not touch mentions inside code", () => {
    expect(sanitizeModelText("run `npm whoami @scope`")).toBe("run `npm whoami @scope`");
  });

  it("neutralizes mentions that emphasis or an email autolink split into their own text node", () => {
    // GitHub matches mentions per rendered text node: `_@x_` becomes <em>@x</em>.
    expect(sanitizeModelText("_@octocat_ __@octocat__ _a_@octocat")).toBe(
      `_@${ZWSP}octocat_ __@${ZWSP}octocat__ _a_@${ZWSP}octocat`,
    );
    expect(sanitizeModelText("dev@example.com@octocat")).toBe(`dev@example.com@${ZWSP}octocat`);
    expect(sanitizeModelText("_dev@example.com_")).toBe("_dev@example.com_");
  });

  it("leaves action and package versions copyable", () => {
    // A zero-width space here would break `uses:` for anyone who copies it from the comment.
    expect(sanitizeModelText("pin actions/checkout@v4 and npm@10")).toBe(
      "pin actions/checkout@v4 and npm@10",
    );
  });
});

describe("sanitizeModelText: HTML and marker spoofing", () => {
  it("removes HTML comments, including multi-line ones", () => {
    expect(sanitizeModelText("before <!-- hidden --> after")).toBe("before  after");
    expect(sanitizeModelText("a<!--\nsecret\n-->b")).toBe("ab");
  });

  it("removes a spoofed marker in prose", () => {
    const out = sanitizeModelText("<!-- ci-triage-agent:workflow=99 -->\nhello");
    expect(out).toBe("\nhello");
  });

  it("defuses a spoofed marker inside code spans and fences", () => {
    const marker = "<!-- ci-triage-agent:workflow=99 -->";
    const out = sanitizeModelText(`\`${marker}\`\n\n\`\`\`\n${marker}\n\`\`\``);
    expect(out).not.toContain("<!-- ci-triage-agent");
    expect(out).toContain(`<!-${ZWSP}- ci-triage-agent:workflow=99 -->`);
  });

  it("escapes script tags and other raw HTML", () => {
    const out = sanitizeModelText(
      '<script>alert(1)</script> <img src="x" onerror="alert(1)"> <a href="https://evil.example">x</a>',
    );
    expect(out).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(rawHtml(out)).toEqual([]);
  });

  it("cannot close our details block or open its own", () => {
    const out = sanitizeModelText("</details>\n<details open><summary>Approved ✅</summary>");
    expect(rawHtml(out)).toEqual([]);
  });

  it("keeps blockquote markers but escapes other angle brackets", () => {
    expect(sanitizeModelText("> quoted <b>text</b> a > b")).toBe("> quoted &lt;b&gt;text&lt;/b&gt; a &gt; b");
  });

  it("strips control and bidi-override characters", () => {
    expect(sanitizeModelText("safe\u202Etxt.exe\u0007\r\nnext")).toBe("safetxt.exe\nnext");
  });

  it("does not let comment removal assemble a marker", () => {
    const out = sanitizeModelText("<!<!-- -->-- ci-triage-agent:workflow=77 -->");
    expect(out).not.toContain("<!--");
    expect(rawHtml(out)).toEqual([]);
  });

  it("escapes dollar signs so GitHub renders no math", () => {
    expect(sanitizeModelText("$\\Huge APPROVED$ and $$x$$")).toBe("\\$\\Huge APPROVED\\$ and \\$\\$x\\$\\$");
    expect(sanitizeModelText("costs \\$5, not \\\\$6")).toBe("costs \\$5, not \\\\\\$6");
    expect(sanitizeModelText("$`\\Huge x`$")).toBe("\\$`\\Huge x`\\$");
  });
});

describe("sanitizeModelText: links and media", () => {
  it("turns images into their alt text", () => {
    expect(sanitizeModelText("![build badge](https://example.com/badge.svg)")).toBe(
      "build badge (image removed)",
    );
    expect(sanitizeModelText("![](https://example.com/pixel.gif)")).toBe("(image removed)");
  });

  it("shows link targets as code instead of links", () => {
    expect(sanitizeModelText("see [the docs](https://example.com/docs) now")).toBe(
      "see the docs (`https://example.com/docs`) now",
    );
    expect(sanitizeModelText("[https://example.com](https://example.com)")).toBe("`https://example.com`");
  });

  it("wraps bare URLs, keeping sentence punctuation outside", () => {
    expect(sanitizeModelText("see https://example.com/a/b.")).toBe("see `https://example.com/a/b`.");
    expect(sanitizeModelText("(https://example.com/x)")).toBe("(`https://example.com/x`)");
    expect(sanitizeModelText("go to www.example.com")).toBe("go to `www.example.com`");
    expect(sanitizeModelText("HTTP://EXAMPLE.COM/A")).toBe("`HTTP://EXAMPLE.COM/A`");
  });

  it("keeps a linked code span readable", () => {
    expect(sanitizeModelText("[`npm ci`](https://example.com/npm-ci)")).toBe(
      "`npm ci` (`https://example.com/npm-ci`)",
    );
  });

  it("leaves no clickable markdown link behind, whatever the nesting", () => {
    for (const input of [
      "[a [b] c](//evil.example)",
      "[x](https://evil.example/((nested)))",
      "\\[a\\](//evil.example)",
      "[ref]\n\n[ref]: //evil.example",
      "[^1]\n\n[^1]: footnote",
      "<https://evil.example>",
    ]) {
      const out = sanitizeModelText(input);
      expect(out, input).not.toMatch(/(?<!\\)(?:\\\\)*\[/);
      expect(out, input).not.toMatch(/(?<!\\)(?:\\\\)*\]/);
      expect(rawHtml(out), input).toEqual([]);
    }
  });
});

describe("sanitizeModelText: code", () => {
  it("keeps inline code verbatim", () => {
    const text = "run `npm ci --omit=<dev> && echo [x](y)` then `@scope/pkg`";
    expect(sanitizeModelText(text)).toBe(text);
  });

  it("keeps fenced code verbatim", () => {
    const text = "Fix:\n\n```ts\nconst id = <T,>(x: T) => x; // @octocat https://example.com\n```\n\nDone.";
    expect(sanitizeModelText(text)).toBe(text);
  });

  it("keeps code spans with nested backticks", () => {
    expect(sanitizeModelText("use ``a ` b`` here")).toBe("use ``a ` b`` here");
    expect(sanitizeModelText("```` ``` ````")).toBe("```` ``` ````");
  });

  it("escapes unpaired backticks so GitHub cannot pair them differently", () => {
    expect(sanitizeModelText("a ` b <i>")).toBe("a \\` b &lt;i&gt;");
  });

  it("pairs backticks per line and escapes the leftovers", () => {
    // Unescaped, GitHub would pair the first backtick with the one on the next line and
    // expose <img> as HTML; escaping it makes GitHub pair them exactly as we did.
    const out = sanitizeModelText("a `b\nc` <img src=x> `d`");
    expect(out).toBe("a \\`b\nc` <img src=x> `d\\`");
    expect(rawHtml(out)).toEqual([]);
  });

  it("respects backslash-escaped backticks", () => {
    const out = sanitizeModelText("\\`<b>`");
    expect(out).toBe("\\`&lt;b&gt;\\`");
  });

  it("separates a code span from a backslash left behind by comment removal", () => {
    const out = sanitizeModelText("\\<!-- -->`<b>`");
    expect(out).toBe(`\\${ZWSP}\`<b>\``);
  });

  it("keeps adjacent code spans from merging into one delimiter run", () => {
    const out = sanitizeModelText("``<b>``https://evil.example");
    expect(out).toBe(`\`\`<b>\`\`${ZWSP}\`https://evil.example\``);
  });

  it("closes an unclosed fence so it cannot swallow what follows", () => {
    expect(sanitizeModelText("```sh\nnpm ci")).toBe("```sh\nnpm ci\n```");
  });

  it("re-emits nested fences at column 0 with their indentation removed", () => {
    const text = "1. Update the lockfile:\n   ```bash\n   npm install\n   ```\n2. Commit it.";
    expect(sanitizeModelText(text)).toBe("1. Update the lockfile:\n```bash\nnpm install\n```\n2. Commit it.");
  });

  it("keeps content that left a list item inside the fence it was written in", () => {
    // In GitHub, "<b>" would end the list item (and the fence) and render as HTML.
    const out = sanitizeModelText("- item\n   ```\n<b>\n   ```\nafter <i>");
    expect(out).toBe("- item\n```\n<b>\n```\nafter &lt;i&gt;");
    expect(rawHtml(out)).toEqual([]);
  });

  it("renders diagram and map fences as plain text", () => {
    expect(sanitizeModelText('```mermaid\ngraph TD; A-->B; click A "https://evil.example"\n```')).toMatch(
      /^```text\n/,
    );
    expect(sanitizeModelText("~~~geojson\n{}\n~~~")).toBe("~~~text\n{}\n~~~");
  });

  it.each([
    ["a removed comment", "<!---->~~~"],
    ["a removed multi-line comment", "<!--\n-->~~~"],
    ["a removed empty link", "[]()~~~"],
  ])("keeps a line that starts a tilde fence only after %s as prose", (_label, opener) => {
    // Unescaped, GitHub would open a fence on the first line and close it on the verbatim
    // fence below, rendering the <img>, mention and link that fence protects.
    const out = sanitizeModelText(
      `${opener}\nfoo\n~~~\n<img src=x onerror=alert(1)> @octocat [x](https://evil.example)\n~~~`,
    );
    expect(out.split("\n")[0]).toBe("\\~~~");
    expect(rawHtml(out)).toEqual([]);
    expect(sanitizeModelText(`> ${opener}`)).toBe("> \\~~~");
  });

  it("does not treat a backtick fence with backticks in its info string as a fence", () => {
    expect(sanitizeModelText("```a`b\n<b>")).toBe("\\`\\`\\`a\\`b\n&lt;b&gt;");
  });

  it("breaks table delimiter rows so cells cannot split protected code spans", () => {
    const out = sanitizeModelText("x\n:-:\n`<b>|`\n\n| a | b |\n|---|---|\n> | c |\n> |:--|");
    expect(out.split("\n")).toEqual([
      "x",
      "\\:-:",
      "`<b>|`",
      "",
      "| a | b |",
      "\\|---|---|",
      "> | c |",
      "> \\|:--|",
    ]);
  });

  it("leaves thematic breaks and list items alone", () => {
    expect(sanitizeModelText("a\n\n---\n\n- b")).toBe("a\n\n---\n\n- b");
  });
});

// ---------------------------------------------------------------------------
// renderComment
// ---------------------------------------------------------------------------

describe("renderComment structure", () => {
  it("starts with the marker and follows the documented layout", () => {
    const body = renderComment(makeResult(), makeMeta());
    const lines = body.split("\n");
    expect(lines[0]).toBe("<!-- ci-triage-agent:workflow=77 -->");
    expect(lines[1]).toBe("### 🧑‍💻 CI triage: applyDiscount() now rounds before subtracting");
    expect(body).toContain(`[CI](${RUN_URL}) · attempt 2 · 🧑‍💻 Code · confidence: high\n`);
    expect(body).not.toContain("rerun recommended");
    expect(body).toContain("**Root cause**\n\nThe change in src/pricing/discount.ts rounds");
    expect(body).toContain(
      "**Suggested fix**\n\nRound after subtracting:\n\n```ts\nreturn round(price - discount);\n```",
    );
    expect(body).toContain(
      "<details>\n<summary>Evidence (2)</summary>\n\n**test (node 24)** line 412\n\n```\n",
    );
    expect(body).toContain("**lint**\n\n```\nsrc/pricing/discount.ts: 1 warning\n```");
    expect(body.trimEnd().split("\n").at(-1)).toBe(
      "<sub>🤖 ci-triage-agent v1.2.3 · claude-opus-5-5 · 3 tool calls · $0.12 · AI-generated, verify before acting</sub>",
    );
    expect(rawHtml(body).filter((tag) => !/^<\/?(details|summary|sub)>$/.test(tag))).toEqual([
      "<!-- ci-triage-agent:workflow=77 -->",
    ]);
  });

  it.each<[Category, string]>([
    ["code", "🧑‍💻 Code"],
    ["flaky", "🎲 Flaky"],
    ["dependency", "📦 Dependency"],
    ["infrastructure", "🏗️ Infrastructure"],
    ["cloud_auth", "🔐 Cloud auth"],
    ["configuration", "⚙️ Configuration"],
    ["unknown", "❓ Unknown"],
  ])("labels the %s category", (category, label) => {
    const body = renderComment(makeResult({ category }), makeMeta());
    expect(body).toContain(` · ${label} · `);
    expect(body).toContain(`### ${label.split(" ")[0]} CI triage:`);
  });

  it("adds a rerun badge when a rerun is recommended", () => {
    const body = renderComment(makeResult({ category: "flaky", rerun_recommended: true }), makeMeta());
    expect(body).toContain("confidence: high · 🔁 rerun recommended");
  });

  it("sanitizes every model-written field", () => {
    const body = renderComment(
      makeResult({
        title: "Ping @octocat <img src=x>",
        root_cause: "See [this](https://evil.example) <!-- ci-triage-agent:workflow=1 -->",
        suggested_fix: "![x](https://evil.example/p.gif) @example-org/admins",
        evidence: [{ job: "build <b>@octocat</b>", line: 3, excerpt: "<!-- ci-triage-agent:workflow=1 -->" }],
      }),
      makeMeta(),
    );
    expect(body).toContain(`### 🧑‍💻 CI triage: Ping @${ZWSP}octocat &lt;img src=x&gt;`);
    expect(body).toContain("See this (`https://evil.example`)");
    expect(body).toContain(`x (image removed) @${ZWSP}example-org/admins`);
    expect(body).toContain(`**build &lt;b&gt;@${ZWSP}octocat&lt;/b&gt;** line 3`);
    expect(countOf(body, "<!-- ci-triage-agent")).toBe(1);
    expect(body).not.toContain("](https://evil");
  });

  it("escapes markdown in workflow and job names", () => {
    const body = renderComment(
      makeResult({ evidence: [{ job: "e2e [shard *1*] _x_ | www.evil.example", line: 1, excerpt: "x" }] }),
      makeMeta({ run: makeRun({ workflowName: "CI](https://evil.example) <b>" }) }),
    );
    expect(body).toContain(`[CI\\](https:${ZWSP}//evil.example) &lt;b&gt;](${RUN_URL})`);
    expect(body).toContain(`**e2e \\[shard \\*1\\*\\] \\_x\\_ \\| www${ZWSP}.evil.example** line 1`);
  });

  it("escapes math delimiters in workflow names and notes", () => {
    const body = renderComment(
      makeResult(),
      makeMeta({ run: makeRun({ workflowName: "CI $\\Huge OK$" }), note: "$x$" }),
    );
    expect(body).toContain(`[CI \\$\\\\Huge OK\\$](${RUN_URL})`);
    expect(body).toContain(" · \\$x\\$ · ");
  });

  it("keeps one-line titles on the heading line", () => {
    const body = renderComment(makeResult({ title: "```\nline two\n# three" }), makeMeta());
    expect(body.split("\n")[1]).toBe("### 🧑‍💻 CI triage: \\`\\`\\` line two # three");
  });

  it("falls back when model fields are empty", () => {
    const body = renderComment(
      makeResult({ title: " ", root_cause: "", suggested_fix: "", evidence: [], fix_location: null }),
      makeMeta(),
    );
    expect(body).toContain("CI triage: CI failure");
    expect(body).toContain("_Not determined._");
    expect(body).toContain("_No suggestion._");
    expect(body).not.toContain("<details>");
    expect(body).not.toContain("Fix location");
  });
});

describe("renderComment caps", () => {
  it("caps the title, root cause and suggested fix", () => {
    const body = renderComment(
      makeResult({ title: "T".repeat(400), root_cause: "R".repeat(3000), suggested_fix: "F".repeat(9000) }),
      makeMeta(),
    );
    expect(body).toContain(`CI triage: ${"T".repeat(149)}…\n`);
    expect(body).toContain(`${"R".repeat(1499)}…`);
    expect(body).not.toContain("R".repeat(1500));
    expect(body).toContain(`${"F".repeat(3999)}…`);
  });

  it("shows at most six evidence items and caps each excerpt", () => {
    const evidence: TriageEvidence[] = Array.from({ length: 10 }, (_, i) => ({
      job: `job-${i}`,
      line: i + 1,
      excerpt: "E".repeat(2000),
    }));
    const body = renderComment(makeResult({ evidence }), makeMeta());
    expect(body).toContain("<summary>Evidence (6 of 10)</summary>");
    expect(body).toContain("**job-5** line 6");
    expect(body).not.toContain("**job-6**");
    expect(body).toContain(`\n${"E".repeat(799)}…\n`);
    expect(body).not.toContain("E".repeat(800));
  });

  it("uses an evidence fence longer than any backtick run in the excerpt", () => {
    const excerpt = "before\n````\ninside ``` fence\n````\nafter <b>";
    const body = renderComment(makeResult({ evidence: [{ job: "build", line: 7, excerpt }] }), makeMeta());
    expect(body).toContain(`**build** line 7\n\n\`\`\`\`\`\n${excerpt}\n\`\`\`\`\`\n`);
  });

  it("trims blank lines around an excerpt in linear time", () => {
    // A quadratic trailing-newline regex took seconds on an inner run this long.
    const excerpt = `\n\nfirst${"\n".repeat(200_000)}last\n\n`;
    const started = performance.now();
    const body = renderComment(makeResult({ evidence: [{ job: "build", line: 1, excerpt }] }), makeMeta());
    expect(performance.now() - started).toBeLessThan(2000);
    expect(body).toContain("**build** line 1\n\n```\nfirst\n");
  });

  it("stays under 60,000 characters with hostile, escape-heavy input", () => {
    const heavy = "&<[@#".repeat(2000);
    const evidence: TriageEvidence[] = Array.from({ length: 6 }, () => ({
      job: "&".repeat(5000),
      line: 1,
      excerpt: "`".repeat(5000),
    }));
    const body = renderComment(
      makeResult({ title: heavy, root_cause: heavy, suggested_fix: heavy.repeat(4), evidence }),
      makeMeta({
        note: "&".repeat(10_000),
        run: makeRun({ workflowName: "&".repeat(10_000) }),
        trace: trace(400),
      }),
    );
    expect(body.length).toBeLessThanOrEqual(60_000);
    expect(body.startsWith(commentMarker(makeRun()))).toBe(true);
  });
});

describe("fix location", () => {
  it("links to the file at the head commit", () => {
    const body = renderComment(makeResult(), makeMeta());
    expect(body).toContain(
      `📍 **Fix location:** [\`src/pricing/discount.ts:12\`](https://github.com/example-org/widgets/blob/${SHA}/src/pricing/discount.ts#L12)`,
    );
  });

  it("encodes path segments and omits the anchor without a line", () => {
    expect(fixLocationUrl(REPO, SHA, { path: "./docs/my file (draft)#1.md", line: null })).toBe(
      `https://github.com/example-org/widgets/blob/${SHA}/docs/my%20file%20%28draft%29%231.md`,
    );
    expect(fixLocationUrl(REPO, SHA, { path: "a/b.ts", line: 0 })).toBe(
      `https://github.com/example-org/widgets/blob/${SHA}/a/b.ts`,
    );
  });

  it("follows the run's host for GitHub Enterprise Server", () => {
    const run = makeRun({ htmlUrl: "https://ghe.acme.example/example-org/widgets/actions/runs/1" });
    const body = renderComment(makeResult(), makeMeta({ run }));
    expect(body).toContain(
      `(https://ghe.acme.example/example-org/widgets/blob/${SHA}/src/pricing/discount.ts#L12)`,
    );
  });

  it.each([
    "../secrets.env",
    "src/../../etc/passwd",
    "https://evil.example/x.ts",
    "javascript:alert(1)",
    "C:\\repo\\a.ts",
    "/home/runner/work/a.ts",
    "//evil.example/a.ts",
    "src//a.ts",
    "src/\u0000a.ts",
  ])("rejects %j", (path) => {
    expect(fixLocationUrl(REPO, SHA, { path, line: 1 })).toBeNull();
  });

  it("does not link a path it had to truncate", () => {
    const path = `src/${"d/".repeat(200)}a.ts`;
    const body = renderComment(makeResult({ fix_location: { path, line: 3 } }), makeMeta());
    expect(body).toMatch(/📍 \*\*Fix location:\*\* `src\/d\/[d/]*…:3`\n/);
    expect(body).not.toContain("/blob/");
  });

  it("rejects a non-hex head SHA", () => {
    expect(fixLocationUrl(REPO, "main", { path: "a.ts", line: 1 })).toBeNull();
  });

  it("shows a rejected path as inert code without a link", () => {
    const body = renderComment(
      makeResult({ fix_location: { path: "https://evil.example/x.ts", line: 3 } }),
      makeMeta(),
    );
    expect(body).toContain("📍 **Fix location:** `https://evil.example/x.ts:3`\n");
    expect(body).not.toContain("/blob/");
  });
});

describe("renderComment footer", () => {
  it("omits the cost when it is unknown", () => {
    const usage = { ...makeMeta().usage!, costUsd: null };
    const body = renderComment(makeResult(), makeMeta({ usage, trace: trace(1) }));
    expect(body).toContain(
      "<sub>🤖 ci-triage-agent v1.2.3 · claude-opus-5-5 · 1 tool call · AI-generated, verify before acting</sub>",
    );
  });

  it("shows tiny costs without rounding them to zero", () => {
    const usage = { ...makeMeta().usage!, costUsd: 0.004 };
    expect(renderComment(makeResult(), makeMeta({ usage }))).toContain(" · &lt;$0.01 · ");
  });

  it("describes heuristic mode and includes the note", () => {
    const body = renderComment(
      makeResult({ category: "dependency" }),
      makeMeta({
        mode: "heuristic",
        model: null,
        usage: null,
        trace: [],
        note: "No anthropic-api-key configured",
      }),
    );
    expect(body).toContain(
      "<sub>🤖 ci-triage-agent v1.2.3 · heuristic mode (no AI) · No anthropic-api-key configured · verify before acting</sub>",
    );
    expect(body).not.toContain("AI-generated");
    expect(body).not.toContain("tool call");
  });
});

// ---------------------------------------------------------------------------
// renderSummary
// ---------------------------------------------------------------------------

describe("renderSummary", () => {
  it("contains the comment content without the marker", () => {
    const summary = renderSummary(makeResult(), makeMeta());
    const comment = renderComment(makeResult(), makeMeta());
    expect(summary.startsWith("### 🧑‍💻 CI triage:")).toBe(true);
    expect(summary).not.toContain("<!-- ci-triage-agent");
    expect(summary).toContain(comment.slice(comment.indexOf("\n") + 1).trimEnd());
  });

  it("adds a usage table, stop cause and redaction count", () => {
    const summary = renderSummary(makeResult(), makeMeta());
    expect(summary).toContain(
      [
        "| Requests | Input tokens | Cache read | Cache write | Output tokens | Cost |",
        "| ---: | ---: | ---: | ---: | ---: | ---: |",
        "| 4 | 12,345 | 30,000 | 5,000 | 2,100 | $0.1234 |",
      ].join("\n"),
    );
    expect(summary).toContain(
      "**Mode:** agent · **Stop cause:** complete · **Turns:** 4 · **Redactions:** 2",
    );
  });

  it("renders the agent trace with truncated, table-safe inputs", () => {
    const calls: ToolCallTrace[] = [
      {
        turn: 1,
        name: "search_log",
        input: { pattern: "a|b", job: "x".repeat(300) },
        ok: true,
        resultChars: 4321,
        durationMs: 12.6,
      },
      {
        turn: 2,
        name: "read_file",
        input: { path: "<!-- ci-triage-agent:workflow=1 -->" },
        ok: false,
        resultChars: 0,
        durationMs: 3,
      },
    ];
    const summary = renderSummary(makeResult(), makeMeta({ trace: calls }));
    const rows = summary.split("\n").filter((line) => /^\| \d+ \| `/.test(line));
    expect(summary).toContain("| Turn | Tool | Input | OK | Result chars | ms |");
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatch(
      /^\| 1 \| `search_log` \| `\{"pattern":"a\\\|b","job":"x+…` \| ✅ \| 4,321 \| 13 \|$/,
    );
    const input = /`(\{"pattern".*?…)`/.exec(rows[0] ?? "")?.[1] ?? "";
    expect(input.replace("\\|", "|")).toHaveLength(120);
    expect(rows[1]).toBe(
      `| 2 | \`read_file\` | \`{"path":"<!-${ZWSP}- ci-triage-agent:workflow=1 -->"}\` | ❌ | 0 | 3 |`,
    );
  });

  it("handles heuristic mode with no usage and no trace", () => {
    const summary = renderSummary(
      makeResult(),
      makeMeta({ mode: "heuristic", model: null, usage: null, trace: [], stopCause: null, redactions: 0 }),
    );
    expect(summary).toContain("No model calls (heuristic mode).");
    expect(summary).toContain("**Mode:** heuristic · **Stop cause:** n/a");
    expect(summary).toContain("#### Agent trace\n\n_No tool calls._");
  });

  it("shows an unknown cost and tolerates unserializable tool input", () => {
    const cyclic: Record<string, unknown> = {};
    cyclic["self"] = cyclic;
    const summary = renderSummary(
      makeResult(),
      makeMeta({
        usage: { ...makeMeta().usage!, costUsd: null },
        trace: [{ turn: 1, name: "x", input: cyclic, ok: true, resultChars: 1, durationMs: 1 }],
      }),
    );
    expect(summary).toContain("| 2,100 | unknown |");
    expect(summary).toContain("`[unserializable input]`");
  });
});

// ---------------------------------------------------------------------------
// renderResolved
// ---------------------------------------------------------------------------

describe("renderResolved", () => {
  const triage = renderComment(makeResult(), makeMeta());
  const passing = makeRun({
    id: 5000,
    attempt: 1,
    headSha: "fedcba9876543210fedcba9876543210fedcba98",
    conclusion: "success",
    htmlUrl: "https://github.com/example-org/widgets/actions/runs/5000",
  });

  it("marks the earlier triage as resolved and keeps it collapsed", () => {
    const body = renderResolved(
      { id: 1, body: triage, htmlUrl: "https://github.com/example-org/widgets/pull/7#issuecomment-1" },
      passing,
    );
    const lines = body.split("\n");
    expect(lines[0]).toBe(commentMarker(passing));
    expect(lines[1]).toBe("### ✅ Resolved: CI passed on fedcba9");
    expect(body).toContain(
      "[View the passing run](https://github.com/example-org/widgets/actions/runs/5000) · attempt 1",
    );
    expect(body).toContain(
      "<details><summary>Previous triage</summary>\n\n### 🧑‍💻 CI triage: applyDiscount()",
    );
    expect(countOf(body, "<!-- ci-triage-agent")).toBe(1);
    expect(body.trimEnd().endsWith("</details>")).toBe(true);
  });

  it("does not nest an already-resolved comment again", () => {
    const first = renderResolved({ id: 1, body: triage, htmlUrl: "" }, passing);
    const later = makeRun({ id: 6000, headSha: "abcdef0123456789abcdef0123456789abcdef01" });
    const second = renderResolved({ id: 1, body: first, htmlUrl: "" }, later);
    expect(second.split("\n")[1]).toBe("### ✅ Resolved: CI passed on abcdef0");
    expect(countOf(second, "<details><summary>Previous triage</summary>")).toBe(1);
    expect(countOf(second, "### ✅ Resolved")).toBe(1);
    expect(second).toContain("### 🧑‍💻 CI triage: applyDiscount()");
    expect(renderResolved({ id: 1, body: second, htmlUrl: "" }, later)).toBe(second);
  });

  it("handles CRLF bodies and escapes the workflow name", () => {
    const body = renderResolved(
      { id: 1, body: triage.replace(/\n/g, "\r\n"), htmlUrl: "" },
      makeRun({ workflowName: "Deploy <prod> @ops" }),
    );
    expect(body.split("\n")[1]).toBe(`### ✅ Resolved: Deploy &lt;prod&gt; @${ZWSP}ops passed on 0123456`);
    expect(body).not.toContain("\r");
  });
});
