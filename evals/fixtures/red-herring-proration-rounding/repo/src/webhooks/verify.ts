import { createHmac, timingSafeEqual } from "node:crypto";

export class WebhookSignatureError extends Error {}

/** Verifies the `t=...,v1=...` signature header sent with payment-provider webhooks. */
export function verifyWebhook(payload: string, header: string, secret: string, toleranceSec = 300): void {
  const parts = Object.fromEntries(header.split(",").map((kv) => kv.split("=") as [string, string]));
  const timestamp = Number(parts.t);
  if (!Number.isFinite(timestamp) || Math.abs(Date.now() / 1000 - timestamp) > toleranceSec) {
    throw new WebhookSignatureError("Timestamp outside the tolerance zone");
  }
  const expected = createHmac("sha256", secret).update(`${timestamp}.${payload}`).digest();
  const given = Buffer.from(parts.v1 ?? "", "hex");
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
    throw new WebhookSignatureError("No signatures found matching the expected signature for payload");
  }
}
