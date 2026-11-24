import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { createUser } from "../db/users.js";
import { sendWelcome } from "../mailer/templates/welcome.js";

const body = z.object({
  email: z.string().email(),
  displayName: z.string().min(1).max(80),
  locale: z.string().optional(),
});

export async function signupRoutes(app: FastifyInstance): Promise<void> {
  app.post("/v1/signup", async (request, reply) => {
    const input = body.parse(request.body);
    const user = await createUser(input);
    await sendWelcome(user);
    return reply.code(201).send({ id: user.id });
  });
}
