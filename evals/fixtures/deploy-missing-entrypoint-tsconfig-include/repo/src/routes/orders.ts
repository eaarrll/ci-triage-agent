import type { FastifyInstance } from "fastify";
import type pg from "pg";
import { z } from "zod";

const createOrder = z.object({
  customerId: z.string().startsWith("cus_"),
  totalCents: z.number().int().positive(),
});

export async function orderRoutes(app: FastifyInstance, opts: { pool: pg.Pool }) {
  app.get<{ Params: { id: string } }>("/v1/orders/:id", async (request, reply) => {
    const { rows } = await opts.pool.query("select * from orders where id = $1", [request.params.id]);
    return rows[0] ?? reply.code(404).send({ error: "not found" });
  });

  app.post("/v1/orders", async (request, reply) => {
    const input = createOrder.parse(request.body);
    const { rows } = await opts.pool.query(
      "insert into orders (id, customer_id, total_cents, status) values (gen_random_uuid(), $1, $2, 'pending') returning id",
      [input.customerId, input.totalCents],
    );
    return reply.code(201).send({ id: rows[0].id });
  });
}
