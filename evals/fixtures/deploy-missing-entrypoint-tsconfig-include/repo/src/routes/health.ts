import type { FastifyInstance } from "fastify";
import type pg from "pg";

export async function healthRoutes(app: FastifyInstance, opts: { pool: pg.Pool; skipDbCheck: boolean }) {
  app.get("/healthz", async () => {
    if (!opts.skipDbCheck) await opts.pool.query("select 1");
    return { ok: true };
  });
}
