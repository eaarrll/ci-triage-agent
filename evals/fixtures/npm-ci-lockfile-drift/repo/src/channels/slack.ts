import { request } from "undici";

export async function postToSlack(channel: string, template: string, data: Record<string, unknown>): Promise<void> {
  const webhook = process.env.SLACK_WEBHOOK_URL;
  if (!webhook) throw new Error("SLACK_WEBHOOK_URL is not set");
  const res = await request(webhook, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ channel, text: `[${template}] ${JSON.stringify(data)}` }),
  });
  if (res.statusCode >= 300) {
    throw new Error(`slack responded ${res.statusCode}`);
  }
  await res.body.dump();
}
