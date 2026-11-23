import { z } from "zod";

const recipientSchema = z
  .object({
    email: z.string().email().optional(),
    slackChannel: z
      .string()
      .regex(/^#[a-z0-9_-]{1,80}$/)
      .optional(),
  })
  .refine((r) => r.email !== undefined || r.slackChannel !== undefined, {
    message: "recipient needs an email or a slackChannel",
  });

export const webhookBodySchema = z.object({
  event: z.string().min(1).max(64),
  template: z.string().min(1),
  recipient: recipientSchema,
  data: z.record(z.unknown()).default({}),
});

export type WebhookBody = z.infer<typeof webhookBodySchema>;
