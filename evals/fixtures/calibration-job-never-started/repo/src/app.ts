import Fastify from "fastify";
import { createPool } from "./db.js";
import { stockRoutes } from "./routes/stock.js";

declare module "fastify" {
  interface FastifyInstance {
    db: import("pg").Pool;
  }
}

export async function buildApp() {
  const app = Fastify({ logger: false });
  app.decorate("db", createPool());
  app.addHook("onClose", async () => app.db.end());
  await app.register(stockRoutes);
  return app;
}
