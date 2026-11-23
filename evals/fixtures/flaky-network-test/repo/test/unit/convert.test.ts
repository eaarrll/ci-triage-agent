import { describe, expect, it } from "vitest";
import { convert, minorUnits, roundHalfEven } from "../../src/convert.js";

const table = { base: "EUR", date: "2026-11-02", rates: { USD: 1.0842, GBP: 0.8531, JPY: 163.41 } };

describe("convert", () => {
  it("returns the amount unchanged for the same currency", () => expect(convert(10, "USD", "USD", table)).toBe(10));
  it("converts from the base", () => expect(convert(100, "EUR", "USD", table)).toBe(108.42));
  it("converts to the base", () => expect(convert(108.42, "USD", "EUR", table)).toBe(100));
  it("computes cross rates through the base", () => expect(convert(100, "GBP", "USD", table)).toBe(127.09));
  it("rounds JPY to whole units", () => expect(convert(10, "EUR", "JPY", table)).toBe(1634));
  it("throws for unknown currencies", () => expect(() => convert(1, "EUR", "CHF", table)).toThrow(RangeError));
});

describe("minorUnits", () => {
  it.each([
    ["USD", 2],
    ["JPY", 0],
    ["KWD", 3],
  ])("%s has %i minor units", (code, units) => expect(minorUnits(code)).toBe(units));
});

describe("roundHalfEven", () => {
  it("rounds half to even", () => {
    expect(roundHalfEven(0.125, 2)).toBe(0.12);
    expect(roundHalfEven(0.135, 2)).toBe(0.14);
  });
  it("rounds other values normally", () => expect(roundHalfEven(1.006, 2)).toBe(1.01));
});
