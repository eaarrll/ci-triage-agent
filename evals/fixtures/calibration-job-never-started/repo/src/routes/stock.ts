import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { adjustStock, adjustStockBulk, getStock } from "../services/stock.js";

const adjustBody = z.object({ warehouse: z.string().min(1), delta: z.number().int() });
const bulkBody = z.object({
  adjustments: z
    .array(z.object({ sku: z.string().min(1), warehouse: z.string().min(1), delta: z.number().int() }))
    .min(1)
    .max(500),
});

export async function stockRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Params: { sku: string } }>("/v1/stock/:sku", async (request) => getStock(app.db, request.params.sku));

  app.post<{ Params: { sku: string } }>("/v1/stock/:sku/adjust", async (request) => {
    const { warehouse, delta } = adjustBody.parse(request.body);
    return { onHand: await adjustStock(app.db, request.params.sku, warehouse, delta) };
  });

  app.post("/v1/stock/adjustments", async (request) => {
    const { adjustments } = bulkBody.parse(request.body);
    return { onHand: await adjustStockBulk(app.db, adjustments) };
  });
}
