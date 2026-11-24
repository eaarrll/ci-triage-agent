import type {
  Category,
  ExistingComment,
  ReportMeta,
  RepoRef,
  RunInfo,
  ToolCallTrace,
  TriageEvidence,
  TriageResult,
} from "./types.js";

// ---------------------------------------------------------------------------
// Limits and labels
// ---------------------------------------------------------------------------

/** GitHub rejects comment bodies over 65,536 characters; stay well clear of that. */
const MAX_BODY_CHARS = 60_000;

interface FieldLimits {
  title: number;
  rootCause: number;
  suggestedFix: number;
  excerpt: number;
  evidenceItems: number;
}

/** Caps on model-written fields. Applied to the raw text, before sanitizing, so an escape is never cut in half. */
const FIELD_LIMITS: FieldLimits = {
  title: 150,
  rootCause: 1500,
  suggestedFix: 4000,
  excerpt: 800,
  evidenceItems: 6,
};

/** Escaping can grow text several-fold; when the body is still too long, re-render with smaller caps. */
const SHRINK_STEPS = [1, 0.5, 0.25, 0.1];

const MAX_WORKFLOW_NAME = 200;
const MAX_JOB_NAME = 100;
const MAX_PATH = 300;
const MAX_NOTE = 500;
const MAX_SHORT_TEXT = 100;
const TRACE_INPUT_CHARS = 120;

const CATEGORY_DISPLAY: Record<Category, { emoji: string; label: string }> = {
  code: { emoji: "🧑‍💻", label: "Code" },
  flaky: { emoji: "🎲", label: "Flaky" },
  dependency: { emoji: "📦", label: "Dependency" },
  infrastructure: { emoji: "🏗️", label: "Infrastructure" },
  cloud_auth: { emoji: "🔐", label: "Cloud auth" },
  configuration: { emoji: "⚙️", label: "Configuration" },
  unknown: { emoji: "❓", label: "Unknown" },
};

const RESOLVED_HEADING = "### ✅ Resolved:";
const PREVIOUS_TRIAGE_OPEN = "<details><summary>Previous triage</summary>";

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Hidden HTML marker identifying this action's comment for one workflow on a PR. */
export function commentMarker(run: RunInfo): string {
  return `<!-- ci-triage-agent:workflow=${run.workflowId} -->`;
}

export interface RunStamp {
  runId: number;
  attempt: number;
}

/** Hidden second line recording which run attempt last wrote the comment. */
export function runStamp(run: Pick<RunInfo, "id" | "attempt">): string {
  return `<!-- ci-triage-agent:run=${run.id}.${run.attempt} -->`;
}

const RUN_STAMP = /^[ \t]*<!-- ci-triage-agent:run=(\d+)\.(\d+) -->[ \t]*$/m;

/** The run attempt that last wrote a comment, or null for comments without a stamp. */
export function parseRunStamp(body: string): RunStamp | null {
  const match = RUN_STAMP.exec(body);
  return match ? { runId: Number(match[1]), attempt: Number(match[2]) } : null;
}

/**
 * True when `existing` was written by a later run than `run`. Run ids grow monotonically per
 * repository, so a slow triage of an older run must not overwrite a newer result.
 */
export function isWrittenByNewerRun(
  existing: ExistingComment,
  run: Pick<RunInfo, "id" | "attempt">,
): boolean {
  const stamp = parseRunStamp(existing.body);
  if (stamp === null) return false;
  return stamp.runId > run.id || (stamp.runId === run.id && stamp.attempt > run.attempt);
}

/**
 * Make model-written text safe to embed in a GitHub comment.
 *
 * The model may echo prompt-injected log text, so its output is treated as hostile: nothing
 * it writes may notify anyone, be clickable, hide content, render raw HTML or embed media.
 * Code spans and fenced blocks keep their content verbatim. The guarantee holds for how
 * GitHub parses the *output*: every backtick left outside a code span is escaped, so GitHub
 * pairs code delimiters exactly as this function did.
 */
export function sanitizeModelText(text: string): string {
  const lines = normalize(text).split("\n");
  const out: string[] = [];
  let prose: string[] = [];
  const flushProse = (): void => {
    if (prose.length > 0) out.push(sanitizeProse(prose.join("\n"), false));
    prose = [];
  };

  for (let i = 0; i < lines.length;) {
    const line = lines[i] ?? "";
    const fence = parseFenceOpen(line);
    if (!fence) {
      prose.push(line);
      i++;
      continue;
    }
    flushProse();
    const { block, next } = readFence(lines, i, fence);
    out.push(block);
    i = next;
  }
  flushProse();
  return out.join("\n");
}

/** PR comment body (starts with commentMarker(meta.run)). */
export function renderComment(result: TriageResult, meta: ReportMeta): string {
  const header = `${commentMarker(meta.run)}\n${runStamp(meta.run)}`;
  return `${header}\n${renderTriage(result, meta, MAX_BODY_CHARS - header.length - 2)}\n`;
}

/** Job summary markdown: the comment content plus usage, cost and the agent's tool trace. */
export function renderSummary(result: TriageResult, meta: ReportMeta): string {
  const sections = [renderTriage(result, meta, MAX_BODY_CHARS), renderUsage(meta), renderTrace(meta.trace)];
  return `${sections.join("\n\n")}\n`;
}

/** Body for an earlier triage comment once the same workflow passes again. */
export function renderResolved(previous: ExistingComment, run: RunInfo): string {
  const workflow = escapeText(run.workflowName || "Workflow", MAX_WORKFLOW_NAME);
  const runUrl = safeUrl(run.htmlUrl);
  const lines = [
    commentMarker(run),
    runStamp(run),
    `${RESOLVED_HEADING} ${workflow} passed on ${shortSha(run.headSha)}`,
    "",
    runUrl ? `[View the passing run](${runUrl}) · attempt ${run.attempt}` : `Attempt ${run.attempt}`,
    "",
    PREVIOUS_TRIAGE_OPEN,
    "",
    previousTriage(previous.body),
    "",
    "</details>",
  ];
  return `${lines.join("\n")}\n`;
}

/**
 * Link to a file at the run's head commit, built only from parts we control or validate.
 * Returns null for anything that is not a plain repository-relative path (traversal,
 * absolute or Windows paths, URLs and other schemes) or when the SHA is not hex.
 */
export function fixLocationUrl(
  repo: RepoRef,
  headSha: string,
  location: { path: string; line: number | null },
  origin = "https://github.com",
): string | null {
  const path = repoRelativePath(location.path);
  if (path === null || !/^[0-9a-f]{7,64}$/i.test(headSha)) return null;
  const encodedPath = path.split("/").map(encodeUrlSegment).join("/");
  const anchor = isPositiveInteger(location.line) ? `#L${location.line}` : "";
  const owner = encodeUrlSegment(repo.owner);
  const name = encodeUrlSegment(repo.repo);
  return `${origin}/${owner}/${name}/blob/${headSha}/${encodedPath}${anchor}`;
}

// ---------------------------------------------------------------------------
// Comment and summary rendering
// ---------------------------------------------------------------------------

/** The comment without its marker, re-rendered with smaller field caps until it fits. */
function renderTriage(result: TriageResult, meta: ReportMeta, maxChars: number): string {
  let body = "";
  for (const scale of SHRINK_STEPS) {
    body = renderTriageWithin(result, meta, scaleLimits(scale));
    if (body.length <= maxChars) break;
  }
  return body;
}

function renderTriageWithin(result: TriageResult, meta: ReportMeta, limits: FieldLimits): string {
  const rootCause = sanitizeModelText(truncate(result.root_cause.trim(), limits.rootCause));
  const fix = sanitizeModelText(truncate(result.suggested_fix.trim(), limits.suggestedFix));
  const sections = [
    renderHeading(result, limits.title),
    renderRunLine(result, meta.run),
    "**Root cause**",
    rootCause || "_Not determined._",
    "**Suggested fix**",
    fix || "_No suggestion._",
    renderFixLocation(result.fix_location, meta),
    renderEvidence(result.evidence, limits),
    renderFooter(meta),
  ];
  // Blank lines between sections keep model text from merging into our own markup.
  return sections.filter((section) => section !== "").join("\n\n");
}

function renderHeading(result: TriageResult, maxTitle: number): string {
  const title = sanitizeInline(truncate(result.title.trim(), maxTitle)) || "CI failure";
  return `### ${categoryDisplay(result.category).emoji} CI triage: ${title}`;
}

function renderRunLine(result: TriageResult, run: RunInfo): string {
  const { emoji, label } = categoryDisplay(result.category);
  const parts = [
    workflowLink(run),
    `attempt ${run.attempt}`,
    `${emoji} ${label}`,
    `confidence: ${escapeText(result.confidence, MAX_SHORT_TEXT)}`,
  ];
  if (result.rerun_recommended) parts.push("🔁 rerun recommended");
  return parts.join(" · ");
}

function workflowLink(run: RunInfo): string {
  const name = escapeText(run.workflowName || "Workflow", MAX_WORKFLOW_NAME);
  const url = safeUrl(run.htmlUrl);
  return url ? `[${name}](${url})` : name;
}

function renderFixLocation(location: TriageResult["fix_location"], meta: ReportMeta): string {
  if (!location || !location.path.trim()) return "";
  const line = isPositiveInteger(location.line) ? location.line : null;
  const path = truncate(location.path.trim(), MAX_PATH);
  const label = codeSpan(line === null ? path : `${path}:${line}`);
  // Built from the full path: a truncated one would link to a file that does not exist.
  const url = fixLocationUrl(
    meta.repo,
    meta.run.headSha,
    { path: location.path, line },
    serverOrigin(meta.run),
  );
  return `📍 **Fix location:** ${url ? `[${label}](${url})` : label}`;
}

function renderEvidence(evidence: readonly TriageEvidence[], limits: FieldLimits): string {
  if (evidence.length === 0) return "";
  const shown = evidence.slice(0, limits.evidenceItems);
  const count = shown.length < evidence.length ? `${shown.length} of ${evidence.length}` : `${shown.length}`;
  const items = shown.flatMap((item) => [renderEvidenceItem(item, limits.excerpt), ""]);
  return ["<details>", `<summary>Evidence (${count})</summary>`, "", ...items, "</details>"].join("\n");
}

function renderEvidenceItem(item: TriageEvidence, maxExcerpt: number): string {
  const job = escapeText(item.job || "job", MAX_JOB_NAME);
  const where = isPositiveInteger(item.line) ? ` line ${item.line}` : "";
  const excerpt = truncate(trimNewlines(normalize(item.excerpt)), maxExcerpt);
  if (!excerpt.trim()) return `**${job}**${where}`;
  // The fence is longer than any backtick run in the excerpt, so no excerpt line can close it.
  const fence = codeFence(excerpt);
  return `**${job}**${where}\n\n${sanitizeModelText(`${fence}\n${excerpt}\n${fence}`)}`;
}

function renderFooter(meta: ReportMeta): string {
  const parts = [`🤖 ci-triage-agent ${escapeText(meta.actionVersion, MAX_SHORT_TEXT)}`];
  const note = meta.note ? escapeText(meta.note, MAX_NOTE) : "";
  if (meta.mode === "heuristic") {
    parts.push("heuristic mode (no AI)");
    if (note) parts.push(note);
    parts.push("verify before acting");
  } else {
    if (meta.model) parts.push(escapeText(meta.model, MAX_SHORT_TEXT));
    parts.push(`${meta.trace.length} tool call${meta.trace.length === 1 ? "" : "s"}`);
    const cost = meta.usage?.costUsd;
    if (typeof cost === "number") parts.push(formatUsd(cost));
    if (note) parts.push(note);
    parts.push("AI-generated, verify before acting");
  }
  return `<sub>${parts.join(" · ")}</sub>`;
}

function renderUsage(meta: ReportMeta): string {
  const lines = ["#### Usage", ""];
  const usage = meta.usage;
  if (usage) {
    const cost = usage.costUsd === null ? "unknown" : `$${usage.costUsd.toFixed(4)}`;
    const cells = [
      usage.requests,
      usage.inputTokens,
      usage.cacheReadTokens,
      usage.cacheWriteTokens,
      usage.outputTokens,
    ].map(formatCount);
    lines.push(
      "| Requests | Input tokens | Cache read | Cache write | Output tokens | Cost |",
      "| ---: | ---: | ---: | ---: | ---: | ---: |",
      `| ${[...cells, cost].join(" | ")} |`,
    );
  } else {
    lines.push("No model calls (heuristic mode).");
  }
  const stopCause = meta.stopCause ?? "n/a";
  lines.push(
    "",
    `**Mode:** ${meta.mode} · **Stop cause:** ${stopCause} · **Turns:** ${formatCount(meta.turns)} · **Redactions:** ${formatCount(meta.redactions)}`,
  );
  return lines.join("\n");
}

function renderTrace(trace: readonly ToolCallTrace[]): string {
  if (trace.length === 0) return "#### Agent trace\n\n_No tool calls._";
  const rows = trace.map((call) =>
    [
      formatCount(call.turn),
      tableCode(call.name),
      tableCode(truncate(stringifyInput(call.input), TRACE_INPUT_CHARS)),
      call.ok ? "✅" : "❌",
      formatCount(call.resultChars),
      formatCount(call.durationMs),
    ].join(" | "),
  );
  return [
    "#### Agent trace",
    "",
    "| Turn | Tool | Input | OK | Result chars | ms |",
    "| ---: | --- | --- | :---: | ---: | ---: |",
    ...rows.map((row) => `| ${row} |`),
  ].join("\n");
}

/** The previous triage content, unwrapped from an earlier "Resolved" comment so it is never nested twice. */
function previousTriage(body: string): string {
  const content = normalize(body)
    .replace(/^[ \t]*<!--\s*ci-triage-agent:[^\n]*-->[ \t]*$/gm, "")
    .trim();
  let previous = content;
  if (content.startsWith(RESOLVED_HEADING)) {
    const start = content.indexOf(PREVIOUS_TRIAGE_OPEN);
    const end = content.lastIndexOf("</details>");
    if (start !== -1 && end > start)
      previous = content.slice(start + PREVIOUS_TRIAGE_OPEN.length, end).trim();
  }
  if (previous.length > MAX_BODY_CHARS) return "_The previous triage was too long to keep._";
  return previous || "_No previous triage content._";
}

// ---------------------------------------------------------------------------
// Sanitizer internals
// ---------------------------------------------------------------------------

const ZWSP = "\u200b";

/** C0/C1 controls (except tab and newline) and bidi overrides, which can disguise text. */
const CONTROL_CHARS = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/g;
const MARKER_LOOKALIKE = /<!--(?=\s*ci-triage-agent)/gi;
const HTML_COMMENT = /<!--[\s\S]*?-->/g;
const IMAGE = /!\[([^[\]\n]*)\]\(([^()\n]*(?:\([^()\n]*\)[^()\n]*)*)\)/g;
const LINK = /\[([^[\]\n]*)\]\(([^()\n]*(?:\([^()\n]*\)[^()\n]*)*)\)/g;
/** URL schemes and the www. prefix that GitHub's autolinker turns into links. */
const BARE_URL = /(?:https?|ftp):\/\/[^\s<>`\u0000]+|www\.[^\s<>`\u0000]+/gi;
/**
 * `@name` or `@org/team`, but not the `@` inside an email address or `actions/checkout@v4`.
 * Mentions are found per rendered text node, so neither `_` (`_@x_` becomes `<em>@x</em>`)
 * nor an email autolinked right before the `@` (`a@b.example@x`) protects one.
 */
const MENTION = /(?:(?<![A-Za-z0-9])|(?<=@[A-Za-z0-9.+_-]*))@(?=[A-Za-z0-9])/g;
/** `#123` and `owner/repo#123` create cross-references (timeline events) in the target. */
const ISSUE_REFERENCE = /#(?=\d)/g;
/** Brackets form links, images and footnotes; `$` forms GitHub math, which can restyle or overlay text. */
const BRACKET_OR_DOLLAR = /(\\*)([[\]$])/g;
const BLOCKQUOTE_PREFIX = /^(?:[ \t]*&gt;)+/;
const TABLE_DELIMITER_ROW = /^((?:[ \t]*>)*[ \t]*)([|:-][|: \t-]*)$/;
const TILDE_FENCE_OPEN = /^((?:[ \t]*>)*[ \t]*)(~{3})/;
const PLACEHOLDER = /\u0000(\d+)\u0000/g;
const FENCE_OPEN = /^([ \t]*)(`{3,}|~{3,})(.*)$/;
const FENCE_CLOSE = /^ {0,3}(`+|~+)[ \t]*$/;
/** Fence languages GitHub renders as diagrams, maps, 3D models or math instead of code. */
const RENDERED_LANGUAGES = new Set(["mermaid", "geojson", "topojson", "stl", "math"]);

/** A protected stretch of output: its final markdown, and the original text for use inside a URL. */
interface Piece {
  markdown: string;
  raw: string;
}

type Hold = (piece: Piece) => string;

interface Fence {
  char: "`" | "~";
  length: number;
  indent: number;
  info: string;
}

function normalize(text: string): string {
  return text.replace(/\r\n?/g, "\n").replace(CONTROL_CHARS, "");
}

/** Single-line variant for headings: no block structure at all. */
function sanitizeInline(text: string): string {
  return sanitizeProse(normalize(text).replace(/\s+/g, " ").trim(), true);
}

/**
 * Sanitize text outside fenced code. Code spans are swapped for placeholders first so the
 * rewrites below never touch them, then restored at the end.
 */
function sanitizeProse(text: string, inline: boolean): string {
  const pieces: Piece[] = [];
  const hold: Hold = (piece) => `\u0000${pieces.push(piece) - 1}\u0000`;

  let s = text
    .split("\n")
    .map((line) => protectCodeSpans(line, hold))
    .join("\n");
  s = s.replace(HTML_COMMENT, "");
  s = s.replace(IMAGE, (_match, alt: string) => `${alt.trim()} (image removed)`.trimStart());
  s = s.replace(LINK, (_match, label: string, target: string) => unlink(label, target, pieces, hold));
  s = s.replace(BARE_URL, (url: string) => {
    const [link, trailing] = splitTrailingPunctuation(url);
    return hold(codePiece(link)) + trailing;
  });
  s = escapeProse(s);
  if (!inline) {
    s = s
      .split("\n")
      .map((line) =>
        neutralizeTildeFence(
          neutralizeTableDelimiter(line.replace(BLOCKQUOTE_PREFIX, (m) => m.replaceAll("&gt;", ">"))),
        ),
      )
      .join("\n");
  }
  return restorePieces(s, pieces);
}

/**
 * Replace code spans on one line with placeholders, following CommonMark's pairing rules
 * (a run of N backticks closes at the next run of exactly N; backslashes do not escape
 * inside a span). Unpaired and backslash-escaped backticks become escaped literals, so
 * the output contains no stray backtick that GitHub could pair differently. Spans never
 * cross lines here: a multi-line span is treated as text, which is only ever over-escaped.
 */
function protectCodeSpans(line: string, hold: Hold): string {
  let out = "";
  let pos = 0;
  while (pos < line.length) {
    const tick = line.indexOf("`", pos);
    if (tick === -1) return out + line.slice(pos);
    if (isBackslashEscaped(line, tick)) {
      out += line.slice(pos, tick - 1) + hold(literalBackticks(1));
      pos = tick + 1;
      continue;
    }
    const run = runLength(line, tick);
    const close = findClosingRun(line, tick + run, run);
    if (close === -1) {
      out += line.slice(pos, tick) + hold(literalBackticks(run));
      pos = tick + run;
    } else {
      const span = line.slice(tick, close + run);
      out += line.slice(pos, tick) + hold({ markdown: defuseMarkers(span), raw: span });
      pos = close + run;
    }
  }
  return out;
}

function findClosingRun(line: string, from: number, length: number): number {
  for (let i = line.indexOf("`", from); i !== -1;) {
    const run = runLength(line, i);
    if (run === length) return i;
    i = line.indexOf("`", i + run);
  }
  return -1;
}

function isBackslashEscaped(text: string, index: number): boolean {
  let slashes = 0;
  for (let i = index - 1; i >= 0 && text[i] === "\\"; i--) slashes++;
  return slashes % 2 === 1;
}

function runLength(text: string, start: number): number {
  let end = start;
  while (text[end] === text[start]) end++;
  return end - start;
}

function literalBackticks(count: number): Piece {
  return { markdown: "\\`".repeat(count), raw: "`".repeat(count) };
}

function codePiece(text: string): Piece {
  const markdown = codeSpan(text);
  return { markdown, raw: markdown };
}

/** `[label](url)` → `label (`url`)`: the reader sees where it pointed but cannot click it. */
function unlink(label: string, target: string, pieces: readonly Piece[], hold: Hold): string {
  const url = linkDestination(restoreRaw(target, pieces));
  const text = label.trim();
  if (!url) return text;
  const code = hold(codePiece(url));
  return text && restoreRaw(text, pieces) !== url ? `${text} (${code})` : code;
}

function linkDestination(target: string): string {
  const trimmed = target.trim();
  if (trimmed.startsWith("<")) {
    const end = trimmed.indexOf(">");
    return end === -1 ? trimmed.slice(1) : trimmed.slice(1, end);
  }
  return trimmed.split(/\s+/)[0] ?? "";
}

/** Keep sentence punctuation (and an unbalanced closing paren) out of a wrapped URL, like GitHub's autolinker. */
function splitTrailingPunctuation(url: string): [string, string] {
  let end = url.length;
  while (end > 1) {
    const ch = url[end - 1] ?? "";
    const head = url.slice(0, end);
    const unbalancedParen = ch === ")" && count(head, "(") < count(head, ")");
    if (!(".,:;!?'\"*_~]".includes(ch) || unbalancedParen)) break;
    end--;
  }
  return [url.slice(0, end), url.slice(end)];
}

function escapeProse(text: string): string {
  return (
    text
      // Escape every bracket and dollar sign that is not already escaped, so no link, image,
      // reference definition, footnote or math can form, whatever they were nested in.
      .replace(BRACKET_OR_DOLLAR, (match, slashes: string, char: string) =>
        slashes.length % 2 === 1 ? match : `${slashes}\\${char}`,
      )
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(MENTION, `@${ZWSP}`)
      .replace(ISSUE_REFERENCE, `#${ZWSP}`)
  );
}

/**
 * GFM splits table cells on `|` before it parses code spans, which would let a cell split
 * one of our protected spans and expose its content as HTML. Tables need a delimiter row
 * (`|---|`, `:-:`), so breaking every such row keeps tables from forming at all.
 */
function neutralizeTableDelimiter(line: string): string {
  const match = TABLE_DELIMITER_ROW.exec(line);
  const row = match?.[2];
  if (row === undefined || !row.includes("-") || !/[|:]/.test(row)) return line;
  return `${match?.[1] ?? ""}\\${row}`;
}

/**
 * Fences are found on the raw text, but removing a comment or an empty link can leave a prose
 * line starting with `~~~` (backticks are always escaped by then). GitHub would open a fence
 * there and close it on one of our verbatim fences, rendering that fence's content as markdown.
 */
function neutralizeTildeFence(line: string): string {
  return line.replace(TILDE_FENCE_OPEN, "$1\\$2");
}

function restorePieces(text: string, pieces: readonly Piece[]): string {
  let out = "";
  let last = 0;
  for (const match of text.matchAll(PLACEHOLDER)) {
    out += text.slice(last, match.index);
    const markdown = pieces[Number(match[1])]?.markdown ?? "";
    // A backslash or backtick right before a delimiter would escape or lengthen it.
    if (isEscapeOrTick(out.at(-1)) && isEscapeOrTick(markdown[0])) out += ZWSP;
    out += markdown;
    last = match.index + match[0].length;
  }
  return out + text.slice(last);
}

function isEscapeOrTick(char: string | undefined): boolean {
  return char === "\\" || char === "`";
}

function restoreRaw(text: string, pieces: readonly Piece[]): string {
  return text.replace(PLACEHOLDER, (_match, index: string) => pieces[Number(index)]?.raw ?? "");
}

function parseFenceOpen(line: string): Fence | null {
  const match = FENCE_OPEN.exec(line);
  const indent = match?.[1];
  const run = match?.[2];
  const info = match?.[3] ?? "";
  if (indent === undefined || run === undefined) return null;
  const char = run.startsWith("`") ? "`" : "~";
  if (char === "`" && info.includes("`")) return null;
  return { char, length: run.length, indent: indent.length, info };
}

/**
 * Copy a fenced block verbatim, re-emitted at column 0 with a guaranteed closing fence.
 * Re-emitting at column 0 makes GitHub see a top-level fence no matter which list or
 * quote the model nested it in, so its content is code in GitHub's eyes exactly when it
 * is code here; an unclosed fence would otherwise swallow the rest of our comment.
 */
function readFence(lines: readonly string[], start: number, fence: Fence): { block: string; next: number } {
  const delimiter = fence.char.repeat(fence.length);
  const body = [delimiter + fenceLanguage(fence.info)];
  let next = start + 1;
  for (; next < lines.length; next++) {
    const line = dedent(lines[next] ?? "", fence.indent);
    if (closesFence(line, fence)) {
      next++;
      break;
    }
    body.push(defuseMarkers(line));
  }
  body.push(delimiter);
  return { block: body.join("\n"), next };
}

function closesFence(line: string, fence: Fence): boolean {
  const run = FENCE_CLOSE.exec(line)?.[1];
  return run !== undefined && run.startsWith(fence.char) && run.length >= fence.length;
}

function fenceLanguage(info: string): string {
  const language = info.trim().split(/\s+/)[0] ?? "";
  if (!/^[\w+#.-]{1,32}$/.test(language)) return "";
  return RENDERED_LANGUAGES.has(language.toLowerCase()) ? "text" : language;
}

function dedent(line: string, columns: number): string {
  let i = 0;
  while (i < columns && (line[i] === " " || line[i] === "\t")) i++;
  return line.slice(i);
}

/** Break anything that could be mistaken for our hidden marker, even inside code. */
function defuseMarkers(text: string): string {
  return text.replace(MARKER_LOOKALIKE, `<!-${ZWSP}-`);
}

// ---------------------------------------------------------------------------
// Small formatting helpers
// ---------------------------------------------------------------------------

/**
 * Escape a short single-line value (job, workflow or model name, note) for inline markdown:
 * no emphasis, code, links, tables, HTML, mentions, issue references or autolinks.
 */
function escapeText(text: string, maxChars: number): string {
  return truncate(normalize(text).replace(/\s+/g, " ").trim(), maxChars)
    .replace(/[\\`*_[\]|~$]/g, "\\$&")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/[@#]/g, `$&${ZWSP}`)
    .replace(/:\/\//g, `:${ZWSP}//`)
    .replace(/(www)\./gi, `$1${ZWSP}.`);
}

/** Inline code that shows `text` verbatim, whatever backticks it contains. */
function codeSpan(text: string): string {
  const content = defuseMarkers(normalize(text).replace(/\n/g, " "));
  if (content === "") return "";
  const delimiter = "`".repeat(longestRun(content, "`") + 1);
  // CommonMark strips one space from each end, and content may not touch the delimiter with a backtick.
  const pad = /^[ `]|[ `]$/.test(content) ? " " : "";
  return `${delimiter}${pad}${content}${pad}${delimiter}`;
}

/** A code span that is also safe inside a GFM table cell. */
function tableCode(text: string): string {
  return (codeSpan(text) || "—").replace(/\|/g, "\\|");
}

function codeFence(content: string): string {
  return "`".repeat(Math.max(3, longestRun(content, "`") + 1));
}

function longestRun(text: string, char: string): number {
  let longest = 0;
  let current = 0;
  for (const ch of text) {
    current = ch === char ? current + 1 : 0;
    longest = Math.max(longest, current);
  }
  return longest;
}

/** Strip leading and trailing newlines in linear time (`/\n+$/` is quadratic on a long inner run). */
function trimNewlines(text: string): string {
  let start = 0;
  let end = text.length;
  while (start < end && text[start] === "\n") start++;
  while (end > start && text[end - 1] === "\n") end--;
  return text.slice(start, end);
}

function truncate(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  let end = Math.max(0, maxChars - 1);
  const last = text.charCodeAt(end - 1);
  if (last >= 0xd800 && last <= 0xdbff) end--; // never split a surrogate pair
  return `${text.slice(0, end)}…`;
}

function scaleLimits(scale: number): FieldLimits {
  const scaled = (limit: number, floor: number): number => Math.max(floor, Math.floor(limit * scale));
  return {
    title: scaled(FIELD_LIMITS.title, 40),
    rootCause: scaled(FIELD_LIMITS.rootCause, 100),
    suggestedFix: scaled(FIELD_LIMITS.suggestedFix, 100),
    excerpt: scaled(FIELD_LIMITS.excerpt, 80),
    evidenceItems: scaled(FIELD_LIMITS.evidenceItems, 1),
  };
}

function categoryDisplay(category: Category): { emoji: string; label: string } {
  return Object.hasOwn(CATEGORY_DISPLAY, category) ? CATEGORY_DISPLAY[category] : CATEGORY_DISPLAY.unknown;
}

function repoRelativePath(raw: string): string | null {
  const path = raw.trim().replace(/^(?:\.\/)+/, "");
  if (path === "" || path.length > MAX_PATH) return null;
  if (/^[A-Za-z][A-Za-z0-9+.-]*:/.test(path)) return null; // https:, javascript:, C:
  if (path.startsWith("/") || path.includes("\\") || /[\u0000-\u001f\u007f]/.test(path)) return null;
  const segments = path.split("/");
  return segments.some((segment) => segment === "" || segment === "." || segment === "..") ? null : path;
}

/** encodeURIComponent leaves parentheses alone, but they end a markdown link destination. */
function encodeUrlSegment(segment: string): string {
  return encodeURIComponent(segment).replace(
    /[()]/g,
    (ch) => `%${ch.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

/** Only plain https URLs from our own GitHub data become link targets. */
function safeUrl(url: string): string | null {
  return /^https:\/\/[^\s<>()[\]`"'\\]+$/.test(url) ? url : null;
}

/** Repository links follow the run's own host, so GitHub Enterprise Server links work too. */
function serverOrigin(run: RunInfo): string {
  const url = safeUrl(run.htmlUrl);
  if (!url) return "https://github.com";
  try {
    return new URL(url).origin;
  } catch {
    return "https://github.com";
  }
}

function shortSha(sha: string): string {
  return /^[0-9a-f]{7,64}$/i.test(sha) ? sha.slice(0, 7) : escapeText(sha, 12);
}

function stringifyInput(input: unknown): string {
  try {
    return JSON.stringify(input) ?? "null";
  } catch {
    return "[unserializable input]";
  }
}

function formatUsd(cost: number): string {
  return cost > 0 && cost < 0.01 ? "&lt;$0.01" : `$${cost.toFixed(2)}`;
}

function formatCount(value: number): string {
  return Number.isFinite(value) ? Math.round(value).toLocaleString("en-US") : "?";
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

function count(text: string, char: string): number {
  return text.split(char).length - 1;
}
