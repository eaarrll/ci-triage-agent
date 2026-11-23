import { describe, expect, it } from "vitest";
import { salesTax, salesTaxRate } from "../../src/pricing/tax.js";

describe("salesTaxRate", () => {
  it.each([
    ["US-CA", 0.0725],
    ["US-NY", 0.04],
    ["US-TX", 0.0625],
    ["US-OR", 0],
  ])("knows the %s rate", (region, rate) => {
    expect(salesTaxRate(region)).toBe(rate);
  });

  it("throws for unknown regions", () => {
    expect(() => salesTaxRate("US-ZZ")).toThrow("No sales tax rate configured for region US-ZZ");
  });
});

describe("salesTax", () => {
  it("rounds to cents", () => {
    expect(salesTax(19.99, "US-TX")).toBe(1.25);
  });

  it("taxes California orders", () => {
    expect(salesTax(100, "US-CA")).toBe(7.25);
  });

  it("is zero for zero amounts", () => {
    expect(salesTax(0, "US-NY")).toBe(0);
  });
});
