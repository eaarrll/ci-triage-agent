import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { createUser } from "../db/users.js";
import { sendWelcome } from "../mailer/templates/welcome.js";
import { sendWelcomeSms } from "../sms/welcome.js";

const body = z
  .object({
    email: z.string().email().optional(),
    phone: z.string().regex(/^\+[1-9]\d{6,14}$/).optional(),
    displayName: z.string().min(1).max(80),
    locale: z.string().optional(),
  })
  .refine((input) => input.email !== undefined || input.phone !== undefined, {
    message: "email or phone is required",
  });

export async function signupRoutes(app: FastifyInstance): Promise<void> {
  app.post("/v1/signup", async (request, reply) => {
    const input = body.parse(request.body);
    const user = await createUser(input);
    if (user.email) await sendWelcome(user);
    else await sendWelcomeSms(user);
    return reply.code(201).send({ id: user.id });
  });
}
