import { sendMail } from "../send.js";
import type { User } from "../../models/user.js";

const SUBJECTS: Record<string, string> = {
  en: "Welcome to Acme",
  es: "Bienvenido a Acme",
  fil: "Maligayang pagdating sa Acme",
};

export async function sendWelcome(user: User): Promise<void> {
  const to: string = user.email;
  const subject = SUBJECTS[user.locale] ?? SUBJECTS.en!;
  await sendMail(to, subject, `<p>Hi ${user.displayName}, thanks for signing up.</p>`);
}
