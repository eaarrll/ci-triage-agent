import type { User } from "../models/user.js";
import { smsProvider } from "./provider.js";

export async function sendWelcomeSms(user: User): Promise<void> {
  if (!user.phone) return;
  await smsProvider().send(user.phone, `Welcome to Acme, ${user.displayName}!`);
}
