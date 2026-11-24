import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "../../src/app.js";
import { resetStock } from "../helpers/db.js";

const app = await buildApp();
afterAll(() => app.close());
beforeEach(() => resetStock([{ sku: "TSHIRT-M", warehouse: "mnl", onHand: 10 }, { sku: "CAP", warehouse: "mnl", onHand: 2 }]));

describe("POST /v1/stock/adjustments", () => {
  it("applies every adjustment", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/stock/adjustments",
      payload: { adjustments: [{ sku: "TSHIRT-M", warehouse: "mnl", delta: -3 }, { sku: "CAP", warehouse: "mnl", delta: 5 }] },
    });
    expect(res.json()).toEqual({ onHand: [7, 7] });
  });

  it("applies none when one would go negative", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/stock/adjustments",
      payload: { adjustments: [{ sku: "TSHIRT-M", warehouse: "mnl", delta: -3 }, { sku: "CAP", warehouse: "mnl", delta: -5 }] },
    });
    expect(res.statusCode).toBe(500);
    const after = await app.inject({ method: "GET", url: "/v1/stock/TSHIRT-M" });
    expect(after.json()[0].onHand).toBe(10);
  });
});
