import Fastify from "fastify";
import type { Config } from "./config.js";
import { createPool } from "./db.js";
import { healthRoutes } from "./routes/health.js";
import { orderRoutes } from "./routes/orders.js";

export async function buildApp(config: Config) {
  const app = Fastify({ logger: { level: config.logLevel } });
  const pool = createPool(config);
  await app.register(healthRoutes, { pool, skipDbCheck: config.skipDbCheck });
  await app.register(orderRoutes, { pool });
  return app;
}
