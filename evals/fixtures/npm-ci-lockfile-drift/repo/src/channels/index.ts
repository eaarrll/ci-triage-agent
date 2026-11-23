import { randomUUID } from "node:crypto";
import { sendEmail } from "./email.js";
import { postToSlack } from "./slack.js";

export interface Notification {
  event: string;
  template: string;
  recipient: { email?: string; slackChannel?: string };
  data: Record<string, unknown>;
}

export async function dispatch(n: Notification): Promise<string> {
  const id = `ntf_${randomUUID()}`;
  const jobs: Promise<void>[] = [];
  if (n.recipient.email) jobs.push(sendEmail(n.recipient.email, n.template, n.data));
  if (n.recipient.slackChannel) jobs.push(postToSlack(n.recipient.slackChannel, n.template, n.data));
  await Promise.all(jobs);
  return id;
}
