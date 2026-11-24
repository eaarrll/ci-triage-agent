import { describe, expect, it, vi } from "vitest";
import { buildApp } from "../../src/app.js";
import { sendWelcome } from "../../src/mailer/templates/welcome.js";
import { sendWelcomeSms } from "../../src/sms/welcome.js";

vi.mock("../../src/mailer/templates/welcome.js", () => ({ sendWelcome: vi.fn() }));
vi.mock("../../src/sms/welcome.js", () => ({ sendWelcomeSms: vi.fn() }));
vi.mock("../../src/db/users.js", () => ({ createUser: vi.fn(async (input) => ({ id: "usr_1", ...input })) }));

describe("POST /v1/signup", () => {
  it("creates a user from an email address", async () => {
    const app = await buildApp();
    const res = await app.inject({ method: "POST", url: "/v1/signup", payload: { email: "ana@example.com", displayName: "Ana" } });
    expect(res.statusCode).toBe(201);
    expect(sendWelcome).toHaveBeenCalled();
  });

  it("creates a user from a phone number only", async () => {
    const app = await buildApp();
    const res = await app.inject({ method: "POST", url: "/v1/signup", payload: { phone: "+639171234567", displayName: "Ben" } });
    expect(res.statusCode).toBe(201);
    expect(sendWelcomeSms).toHaveBeenCalled();
  });

  it("requires an email address or a phone number", async () => {
    const app = await buildApp();
    const res = await app.inject({ method: "POST", url: "/v1/signup", payload: { displayName: "Cy" } });
    expect(res.statusCode).toBe(400);
  });

  it("rejects a malformed email address", async () => {
    const app = await buildApp();
    const res = await app.inject({ method: "POST", url: "/v1/signup", payload: { email: "nope", displayName: "Ana" } });
    expect(res.statusCode).toBe(400);
  });
});
