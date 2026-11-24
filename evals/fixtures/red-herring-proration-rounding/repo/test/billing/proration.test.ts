import { describe, expect, it } from "vitest";
import { unusedCredit, upgradeCharge } from "../../src/billing/proration.js";
import type { Subscription } from "../../src/billing/types.js";

const team = { id: "team", priceCents: 3000 };
const business = { id: "business", priceCents: 6000 };

const sub: Subscription = {
  id: "sub_1",
  customerId: "cus_1",
  plan: team,
  periodStart: new Date("2026-11-01T00:00:00Z"),
  periodEnd: new Date("2026-12-01T00:00:00Z"),
};

describe("unusedCredit", () => {
  it("credits the full price at the start of the period", () => {
    expect(unusedCredit(sub, sub.periodStart)).toBe(3000);
  });

  it("credits nothing at the end of the period", () => {
    expect(unusedCredit(sub, sub.periodEnd)).toBe(0);
  });

  it("credits whole days exactly", () => {
    expect(unusedCredit(sub, new Date("2026-11-16T00:00:00Z"))).toBe(1500);
  });

  it("credits the unused part of a mid-day downgrade", () => {
    // 17.5 of 30 days left
    expect(unusedCredit(sub, new Date("2026-11-13T12:00:00Z"))).toBe(1750);
  });
});

describe("upgradeCharge", () => {
  it("charges the difference for a mid-day upgrade", () => {
    expect(upgradeCharge(sub, business, new Date("2026-11-13T12:00:00Z"))).toBe(1750);
  });

  it("charges nothing for a downgrade", () => {
    expect(upgradeCharge({ ...sub, plan: business }, team, new Date("2026-11-13T12:00:00Z"))).toBe(0);
  });

  it("charges the full difference at the start of the period", () => {
    expect(upgradeCharge(sub, business, sub.periodStart)).toBe(3000);
  });
});
