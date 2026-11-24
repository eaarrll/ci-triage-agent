import { describe, expect, it } from "vitest";
import { addResponseUsage, addUsage, emptyUsage, normalizeModelId, priceFor } from "../src/agent/pricing.js";

describe("priceFor", () => {
  it("returns list prices per million tokens", () => {
    expect(priceFor("claude-opus-5-5")).toEqual({ input: 4, output: 20, cacheRead: 0.2, cacheWrite: 5 });
    expect(priceFor("claude-sonnet-4-6")).toEqual({ input: 3, output: 15, cacheRead: 0.3, cacheWrite: 3.75 });
    expect(priceFor("claude-haiku-5-5")).toEqual({
      input: 0.1,
      output: 0.5,
      cacheRead: 0.01,
      cacheWrite: 0.125,
    });
    expect(priceFor("claude-fable-5")).toEqual({ input: 10, output: 50, cacheRead: 1, cacheWrite: 12.5 });
  });

  it("tolerates provider prefixes", () => {
    expect(priceFor("anthropic.claude-opus-5-5")).toEqual(priceFor("claude-opus-5-5"));
    expect(priceFor("us.anthropic.claude-sonnet-5-5")).toEqual(priceFor("claude-sonnet-5-5"));
    expect(normalizeModelId("eu.anthropic.claude-haiku-4-5")).toBe("claude-haiku-4-5");
  });

  it("returns null for unknown or inexact ids", () => {
    expect(priceFor("claude-opus-5-5-preview")).toBeNull();
    expect(priceFor("gpt-example")).toBeNull();
    expect(priceFor("")).toBeNull();
  });
});

describe("addUsage", () => {
  it("accumulates tokens and prices each response by its model", () => {
    let totals = emptyUsage();
    totals = addUsage(totals, "claude-opus-5-5", {
      input_tokens: 1_000_000,
      output_tokens: 100_000,
      cache_read_input_tokens: 2_000_000,
      cache_creation_input_tokens: 200_000,
    });
    // 4 + 2 + 0.4 + 1
    expect(totals.costUsd).toBeCloseTo(7.4, 10);
    totals = addUsage(totals, "claude-haiku-5-5", { input_tokens: 1_000_000, output_tokens: 1_000_000 });
    expect(totals).toEqual({
      requests: 2,
      inputTokens: 2_000_000,
      outputTokens: 1_100_000,
      cacheReadTokens: 2_000_000,
      cacheWriteTokens: 200_000,
      costUsd: expect.closeTo(7.4 + 0.6, 10) as number,
    });
  });

  it("treats missing cache fields as zero", () => {
    const totals = addUsage(emptyUsage(), "claude-sonnet-5-5", {
      input_tokens: 10,
      output_tokens: 5,
      cache_read_input_tokens: null,
      cache_creation_input_tokens: null,
    });
    expect(totals.cacheReadTokens).toBe(0);
    expect(totals.cacheWriteTokens).toBe(0);
    expect(totals.costUsd).toBeCloseTo((10 * 2 + 5 * 10) / 1_000_000, 12);
  });

  it("returns a new object and leaves the input untouched", () => {
    const before = emptyUsage();
    const after = addUsage(before, "claude-opus-5-5", { input_tokens: 1, output_tokens: 1 });
    expect(after).not.toBe(before);
    expect(before).toEqual(emptyUsage());
  });

  it("makes the cost unknown for good once a response comes from an unpriced model", () => {
    let totals = addUsage(emptyUsage(), "claude-opus-5-5", { input_tokens: 100, output_tokens: 10 });
    totals = addUsage(totals, "claude-unknown-model", { input_tokens: 100, output_tokens: 10 });
    expect(totals.costUsd).toBeNull();
    totals = addUsage(totals, "claude-opus-5-5", { input_tokens: 100, output_tokens: 10 });
    expect(totals.costUsd).toBeNull();
    expect(totals.requests).toBe(3);
    expect(totals.inputTokens).toBe(300);
  });
});

describe("price table", () => {
  it.each([
    ["claude-opus-5-5", 4, 20, 0.2, 5],
    ["claude-opus-5", 5, 25, 0.5, 6.25],
    ["claude-opus-4-8", 5, 25, 0.5, 6.25],
    ["claude-opus-4-7", 5, 25, 0.5, 6.25],
    ["claude-opus-4-6", 5, 25, 0.5, 6.25],
    ["claude-sonnet-5-5", 2, 10, 0.1, 2.5],
    ["claude-sonnet-5", 2, 10, 0.2, 2.5],
    ["claude-sonnet-4-6", 3, 15, 0.3, 3.75],
    ["claude-haiku-5-5", 0.1, 0.5, 0.01, 0.125],
    ["claude-haiku-4-5", 1, 5, 0.1, 1.25],
    ["claude-fable-5-2", 8, 40, 0.2, 10],
    ["claude-fable-5-1", 10, 50, 0.25, 12.5],
    ["claude-fable-5", 10, 50, 1, 12.5],
  ])("prices %s at the list rate", (model, input, output, cacheRead, cacheWrite) => {
    expect(priceFor(model)).toEqual({ input, output, cacheRead, cacheWrite });
  });

  it("only strips cloud provider prefixes, not arbitrary ones", () => {
    expect(priceFor("global.anthropic.claude-opus-5-5")).toEqual(priceFor("claude-opus-5-5"));
    expect(priceFor("bedrock/claude-opus-5-5")).toBeNull();
    expect(priceFor("anthropic.claude-opus-5-5-v1:0")).toBeNull();
    expect(priceFor("CLAUDE-OPUS-5-5")).toBeNull();
  });
});

describe("pricing fixes from review", () => {
  it("prices dated snapshot ids by their base model", () => {
    expect(priceFor("claude-haiku-4-5-20251001")).toEqual(priceFor("claude-haiku-4-5"));
    expect(priceFor("claude-haiku-4-5-20251001")).not.toBeNull();
  });

  it("prices Fable 5.1 cache reads at $0.25 and knows the Mythos models", () => {
    expect(priceFor("claude-fable-5-1")?.cacheRead).toBe(0.25);
    expect(priceFor("claude-mythos-5-2")).toEqual(priceFor("claude-fable-5-2"));
  });

  it("prices every attempt in usage.iterations by its own model, as one request", () => {
    const totals = addResponseUsage(emptyUsage(), "claude-opus-4-8", {
      input_tokens: 100,
      output_tokens: 10,
      iterations: [
        { type: "message", model: "claude-opus-5-5", input_tokens: 1000, output_tokens: 50 },
        { type: "fallback_message", model: "claude-opus-4-8", input_tokens: 100, output_tokens: 10 },
      ],
    });
    expect(totals.requests).toBe(1);
    expect(totals.inputTokens).toBe(1100);
    const expected = (1000 * 4 + 50 * 20) / 1e6 + (100 * 5 + 10 * 25) / 1e6;
    expect(totals.costUsd).toBeCloseTo(expected, 10);
  });
});
