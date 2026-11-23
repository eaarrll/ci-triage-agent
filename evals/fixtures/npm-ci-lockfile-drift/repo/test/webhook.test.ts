import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { buildServer } from "../src/server.js";

vi.mock("../src/channels/index.js", () => ({ dispatch: vi.fn(async () => "ntf_01") }));

describe("POST /v1/webhooks/notify", () => {
  const app = buildServer({ logger: false });
  beforeAll(() => app.ready());
  afterAll(() => app.close());

  it("accepts a valid payload", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/webhooks/notify",
      payload: { event: "invoice.paid", template: "receipt", recipient: { email: "ops@example.com" } },
    });
    expect(res.statusCode).toBe(202);
    expect(res.json()).toEqual({ id: "ntf_01" });
  });

  it("rejects a payload without a recipient", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/webhooks/notify",
      payload: { event: "invoice.paid", template: "receipt", recipient: {} },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe("invalid_payload");
  });

  it("reports the offending field for a malformed email", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/webhooks/notify",
      payload: { event: "invoice.paid", template: "receipt", recipient: { email: "not-an-email" } },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().issues).toContainEqual(expect.objectContaining({ path: "recipient.email" }));
  });
});
