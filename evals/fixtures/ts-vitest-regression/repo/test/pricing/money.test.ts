import { describe, expect, it } from "vitest";
import { formatMoney, roundMoney, sumMoney } from "../../src/pricing/money.js";

describe("roundMoney", () => {
  it("rounds half-cent values up", () => {
    expect(roundMoney(1.005)).toBe(1.01);
    expect(roundMoney(2.675)).toBe(2.68);
  });

  it("leaves whole amounts alone", () => {
    expect(roundMoney(10)).toBe(10);
  });
});

describe("sumMoney", () => {
  it("hides floating point noise", () => {
    expect(sumMoney([0.1, 0.2])).toBe(0.3);
  });

  it("returns 0 for no amounts", () => {
    expect(sumMoney([])).toBe(0);
  });
});

describe("formatMoney", () => {
  it("formats USD with grouping", () => {
    expect(formatMoney(1234.5, "USD")).toBe("$1,234.50");
  });

  it("formats EUR", () => {
    expect(formatMoney(9.99, "EUR")).toBe("€9.99");
  });
});
