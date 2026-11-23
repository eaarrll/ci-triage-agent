import { request } from "undici";

const MAILER_URL = process.env.MAILER_URL ?? "http://mailer.internal.example.com";

export async function sendEmail(to: string, template: string, data: Record<string, unknown>): Promise<void> {
  const res = await request(`${MAILER_URL}/v1/send`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ to, template, data }),
  });
  if (res.statusCode >= 300) {
    throw new Error(`mailer responded ${res.statusCode}`);
  }
  await res.body.dump();
}
