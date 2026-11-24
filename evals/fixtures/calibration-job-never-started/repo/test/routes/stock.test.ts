import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "../../src/app.js";
import { resetStock } from "../helpers/db.js";

const app = await buildApp();
afterAll(() => app.close());
beforeEach(() => resetStock([{ sku: "TSHIRT-M", warehouse: "mnl", onHand: 10 }]));

describe("stock routes", () => {
  it("returns stock per warehouse", async () => {
    const res = await app.inject({ method: "GET", url: "/v1/stock/TSHIRT-M" });
    expect(res.json()).toEqual([{ sku: "TSHIRT-M", warehouse: "mnl", onHand: 10 }]);
  });

  it("adjusts one warehouse", async () => {
    const res = await app.inject({ method: "POST", url: "/v1/stock/TSHIRT-M/adjust", payload: { warehouse: "mnl", delta: -4 } });
    expect(res.json()).toEqual({ onHand: 6 });
  });
});
