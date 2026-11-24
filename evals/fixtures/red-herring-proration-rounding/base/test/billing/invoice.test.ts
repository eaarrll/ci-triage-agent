import { describe, expect, it } from "vitest";
import { planChangeLines, totalCents } from "../../src/billing/invoice.js";

const sub = {
  id: "sub_1",
  customerId: "cus_1",
  plan: { id: "team", priceCents: 3000 },
  periodStart: new Date("2026-11-01T00:00:00Z"),
  periodEnd: new Date("2026-12-01T00:00:00Z"),
};

describe("planChangeLines", () => {
  it("credits the old plan and charges the new one", () => {
    const lines = planChangeLines(sub, { id: "business", priceCents: 6000 }, new Date("2026-11-16T00:00:00Z"));
    expect(lines).toEqual([
      { description: "Unused time on team", amountCents: -1500 },
      { description: "Remaining time on business", amountCents: 3000 },
    ]);
    expect(totalCents(lines)).toBe(1500);
  });
});
