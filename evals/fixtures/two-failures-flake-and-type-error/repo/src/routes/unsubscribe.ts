import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { findUserByToken, setDigestOptIn } from "../db/users.js";
import { audit } from "../audit.js";

const query = z.object({ token: z.string().min(16) });

/** One-click unsubscribe link from the digest footer (RFC 8058). */
export async function unsubscribeRoutes(app: FastifyInstance): Promise<void> {
  app.post("/v1/unsubscribe", async (request, reply) => {
    const { token } = query.parse(request.query);
    const user = await findUserByToken(token);
    if (!user) return reply.code(404).send({ error: "unknown token" });

    await setDigestOptIn(user.id, false);

    // Abuse reports are grouped by mail domain.
    const domain = user.email.split("@")[1];
    audit("digest.unsubscribe", { userId: user.id, domain });
    return reply.code(204).send();
  });
}
