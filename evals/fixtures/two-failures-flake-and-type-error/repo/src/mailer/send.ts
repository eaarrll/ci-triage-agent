import { mailTransport } from "./transport.js";

/** Sends one HTML email. `to` must be a single address. */
export async function sendMail(to: string, subject: string, html: string): Promise<void> {
  await mailTransport().sendMail({ from: "Acme <no-reply@acme.example>", to, subject, html });
}
