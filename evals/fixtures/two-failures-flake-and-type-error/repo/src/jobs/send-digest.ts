import { listDigestRecipients, pendingItems } from "../db/digest.js";
import { sendMail } from "../mailer/send.js";
import type { User } from "../models/user.js";

export interface DigestItem {
  title: string;
  url: string;
  createdAt: Date;
}

function digestSubject(items: DigestItem[]): string {
  return items.length === 1 ? "1 new update for you" : `${items.length} new updates for you`;
}

function renderDigest(user: User, items: DigestItem[]): string {
  const lines = items.map((item) => `<li><a href="${item.url}">${item.title}</a></li>`);
  return `<p>Hi ${user.displayName},</p><ul>${lines.join("")}</ul>`;
}

/**
 * Sends the weekly digest to every opted-in user with pending items.
 * Runs from the scheduler every Monday at 08:00 in each user's locale.
 */
export async function sendDigests(now = new Date()): Promise<number> {
  let sent = 0;
  for await (const user of listDigestRecipients()) {
    const items = await pendingItems(user.id, now);
    if (items.length === 0) continue;
    try {
      // One failed address must not stop the batch.
      await sendMail(user.email, digestSubject(items), renderDigest(user, items));
      sent++;
    } catch (error) {
      console.warn(`[digest] could not send to ${user.id}: ${String(error)}`);
    }
  }
  return sent;
}
