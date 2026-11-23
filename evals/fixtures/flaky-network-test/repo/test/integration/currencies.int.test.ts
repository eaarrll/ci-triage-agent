import { describe, expect, it } from "vitest";
import { RatesClient } from "../../src/client.js";

const baseUrl = process.env.RATES_SANDBOX_URL;
const apiKey = process.env.RATES_SANDBOX_API_KEY;

describe.runIf(baseUrl && apiKey)("GET /v2/currencies", () => {
  it("lists ISO 4217 codes", async () => {
    const client = new RatesClient({ baseUrl: baseUrl!, apiKey: apiKey! });
    const currencies = await client.currencies();
    expect(Object.keys(currencies)).toEqual(expect.arrayContaining(["EUR", "USD", "GBP", "JPY"]));
    for (const code of Object.keys(currencies)) expect(code).toMatch(/^[A-Z]{3}$/);
  });

  it("rejects a bad API key", async () => {
    const client = new RatesClient({ baseUrl: baseUrl!, apiKey: "not-a-real-key" });
    await expect(client.currencies()).rejects.toThrow(/HTTP 401/);
  });
});
