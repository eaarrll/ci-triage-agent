import { describe, expect, it } from "vitest";
import { SmsProvider } from "../../src/sms/provider.js";

// Talks to the provider's public sandbox; skipped when no sandbox token is configured.
const url = process.env.SMS_SANDBOX_URL;
const token = process.env.SMS_SANDBOX_TOKEN;

describe.skipIf(!url || !token)("SmsProvider (sandbox)", () => {
  const provider = new SmsProvider(url!, token!);

  it("delivers a message to the sandbox", async () => {
    const result = await provider.send("+15005550006", "integration test");
    expect(result.status).toBe("queued");
  });

  it("rejects an invalid number", async () => {
    await expect(provider.send("+15005550001", "integration test")).rejects.toThrow("400");
  });

  it("reports the delivery status", async () => {
    const { id } = await provider.send("+15005550006", "status test");
    expect((await provider.status(id)).status).toMatch(/queued|sent/);
  });
});
