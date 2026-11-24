import { describe, expect, it, vi } from "vitest";
import { buildApp } from "../../src/app.js";

vi.mock("../../src/mailer/templates/welcome.js", () => ({ sendWelcome: vi.fn() }));
vi.mock("../../src/db/users.js", () => ({ createUser: vi.fn(async (input) => ({ id: "usr_1", ...input })) }));

describe("POST /v1/signup", () => {
  it("creates a user from an email address", async () => {
    const app = await buildApp();
    const res = await app.inject({ method: "POST", url: "/v1/signup", payload: { email: "ana@example.com", displayName: "Ana" } });
    expect(res.statusCode).toBe(201);
  });

  it("rejects a malformed email address", async () => {
    const app = await buildApp();
    const res = await app.inject({ method: "POST", url: "/v1/signup", payload: { email: "nope", displayName: "Ana" } });
    expect(res.statusCode).toBe(400);
  });
});
