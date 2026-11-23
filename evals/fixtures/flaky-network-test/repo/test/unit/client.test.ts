import { describe, expect, it, vi } from "vitest";
import { RatesClient } from "../../src/client.js";
import { RatesApiError } from "../../src/errors.js";

const body = { base: "EUR", date: "2026-11-02", rates: { USD: 1.0842 } };
const json = (status: number, data: unknown, headers: Record<string, string> = {}) =>
  new Response(status === 304 ? null : JSON.stringify(data), { status, headers });

function client(fetchImpl: typeof fetch, opts: { retries?: number; timeoutMs?: number } = {}) {
  return new RatesClient({ baseUrl: "https://rates.test/", apiKey: "test-key", fetch: fetchImpl, ...opts });
}

describe("RatesClient", () => {
  it("sends the bearer token and parses the body", async () => {
    const fetchImpl = vi.fn(async () => json(200, body));
    await expect(client(fetchImpl).latest({ base: "EUR" })).resolves.toEqual(body);
    expect(fetchImpl).toHaveBeenCalledWith(
      "https://rates.test/v2/latest?base=EUR",
      expect.objectContaining({ headers: expect.objectContaining({ authorization: "Bearer test-key" }) }),
    );
  });

  it("encodes symbols", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => json(200, body));
    await client(fetchImpl).latest({ base: "EUR", symbols: ["USD", "GBP"] });
    expect(fetchImpl.mock.calls[0]?.[0]).toBe("https://rates.test/v2/latest?base=EUR&symbols=USD%2CGBP");
  });

  it("retries once on 503 and then succeeds", async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(json(503, {})).mockResolvedValueOnce(json(200, body));
    await expect(client(fetchImpl).latest({ base: "EUR" })).resolves.toEqual(body);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("gives up after the configured retries", async () => {
    const fetchImpl = vi.fn(async () => json(502, {}));
    await expect(client(fetchImpl, { retries: 0 }).latest({ base: "EUR" })).rejects.toThrow(/HTTP 502/);
  });

  it("does not retry 4xx responses", async () => {
    const fetchImpl = vi.fn(async () => json(422, { error: "unsupported base" }));
    await expect(client(fetchImpl).latest({ base: "XXX" })).rejects.toBeInstanceOf(RatesApiError);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("surfaces network errors from fetch", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError("fetch failed");
    });
    await expect(client(fetchImpl).latest({ base: "EUR" })).rejects.toThrow(/fetch failed/);
  });

  it("maps an aborted request to a timeout error", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new DOMException("The operation was aborted due to timeout", "TimeoutError");
    });
    await expect(client(fetchImpl, { timeoutMs: 20 }).latest({ base: "EUR" })).rejects.toThrow(/timed out after 20ms/);
  });

  it("serves the cached body on 304", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(json(200, body, { etag: '"v1"' }))
      .mockResolvedValueOnce(json(304, null));
    const c = client(fetchImpl);
    const first = await c.latest({ base: "EUR" });
    await expect(c.latest({ base: "EUR" })).resolves.toEqual(first);
  });
});
