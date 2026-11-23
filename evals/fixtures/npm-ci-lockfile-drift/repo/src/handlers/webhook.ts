import type { FastifyInstance } from "fastify";
import { dispatch } from "../channels/index.js";
import { webhookBodySchema } from "../schemas/webhook.js";

export async function webhookRoutes(app: FastifyInstance): Promise<void> {
  app.post("/v1/webhooks/notify", async (request, reply) => {
    const parsed = webhookBodySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({
        error: "invalid_payload",
        issues: parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
      });
    }
    const id = await dispatch(parsed.data);
    return reply.code(202).send({ id });
  });
}
