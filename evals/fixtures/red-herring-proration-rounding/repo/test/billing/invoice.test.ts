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
      { description: "Unused time on team (15 days remaining)", amountCents: -1500 },
      { description: "Remaining time on business (15 days remaining)", amountCents: 3000 },
    ]);
    expect(totalCents(lines)).toBe(1500);
  });

  it("shows whole days remaining on both lines", () => {
    const lines = planChangeLines(sub, { id: "business", priceCents: 6000 }, new Date("2026-11-29T18:00:00Z"));
    expect(lines.map((line) => line.description)).toEqual([
      "Unused time on team (1 days remaining)",
      "Remaining time on business (1 days remaining)",
    ]);
  });
});
