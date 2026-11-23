import type { FastifyInstance } from "fastify";
import { dispatch } from "../channels/index.js";

interface WebhookBody {
  event: string;
  template: string;
  recipient: { email?: string; slackChannel?: string };
  data?: Record<string, unknown>;
}

export async function webhookRoutes(app: FastifyInstance): Promise<void> {
  app.post<{ Body: WebhookBody }>("/v1/webhooks/notify", async (request, reply) => {
    const body = request.body;
    if (!body?.event || !body.template || (!body.recipient?.email && !body.recipient?.slackChannel)) {
      return reply.badRequest("event, template and a recipient are required");
    }
    const id = await dispatch({
      event: body.event,
      template: body.template,
      recipient: body.recipient,
      data: body.data ?? {},
    });
    return reply.code(202).send({ id });
  });
}
