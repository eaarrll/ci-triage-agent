import { beforeAll, describe, expect, it } from "vitest";
import { RatesClient } from "../../src/client.js";

const baseUrl = process.env.RATES_SANDBOX_URL;
const apiKey = process.env.RATES_SANDBOX_API_KEY;

describe.runIf(baseUrl && apiKey)("RatesClient (sandbox)", () => {
  let client: RatesClient;

  beforeAll(() => {
    client = new RatesClient({ baseUrl: baseUrl!, apiKey: apiKey! });
  });

  it("authenticates with the sandbox key", async () => {
    await expect(client.currencies()).resolves.toHaveProperty("EUR");
  });

  it("fetches latest rates from sandbox", async () => {
    const res = await client.latest({ base: "EUR", symbols: ["USD", "GBP", "JPY"] });
    expect(res.base).toBe("EUR");
    expect(Object.keys(res.rates).sort()).toEqual(["GBP", "JPY", "USD"]);
    for (const rate of Object.values(res.rates)) expect(rate).toBeGreaterThan(0);
  });

  it("fetches historical rates for a fixed date", async () => {
    const res = await client.historical("2024-03-01", { base: "USD", symbols: ["EUR"] });
    expect(res.date).toBe("2024-03-01");
    expect(res.rates.EUR).toBeCloseTo(0.9234, 3);
  });

  it("rejects unsupported base currencies", async () => {
    await expect(client.latest({ base: "XXX" })).rejects.toThrow(/HTTP 422/);
  });

  it("reuses the ETag on repeat requests", async () => {
    const first = await client.latest({ base: "GBP" });
    const second = await client.latest({ base: "GBP" });
    expect(second).toBe(first);
  });
});
