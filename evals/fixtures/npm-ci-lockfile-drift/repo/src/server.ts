import Fastify, { type FastifyServerOptions } from "fastify";
import sensible from "@fastify/sensible";
import { webhookRoutes } from "./handlers/webhook.js";

export function buildServer(opts: FastifyServerOptions = {}) {
  const app = Fastify(opts);
  app.register(sensible);
  app.get("/healthz", async () => ({ ok: true }));
  app.register(webhookRoutes);
  return app;
}
