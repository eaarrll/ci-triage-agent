import { describe, expect, it } from "vitest";
import { parseRates } from "../../src/parse.js";
import { RatesApiError } from "../../src/errors.js";

describe("parseRates", () => {
  it("accepts a well-formed body", () => {
    expect(parseRates({ base: "EUR", date: "2026-11-02", rates: { USD: 1.08 } }).rates.USD).toBe(1.08);
  });
  it("rejects non-objects", () => expect(() => parseRates("nope")).toThrow(RatesApiError));
  it("rejects missing fields", () => expect(() => parseRates({ base: "EUR" })).toThrow(/missing/));
  it("rejects non-finite rates", () => {
    expect(() => parseRates({ base: "EUR", date: "2026-11-02", rates: { USD: "1.08" } })).toThrow(/USD/);
    expect(() => parseRates({ base: "EUR", date: "2026-11-02", rates: { USD: Number.NaN } })).toThrow(/USD/);
  });
});
