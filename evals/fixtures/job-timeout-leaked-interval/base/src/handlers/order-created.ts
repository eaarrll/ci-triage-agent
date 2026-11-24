import type { Logger } from "pino";
import { z } from "zod";
import { upsertOrder } from "../store/orders";
import { publishAnalytics } from "../analytics";

const event = z.object({
  type: z.literal("order.created"),
  orderId: z.string(),
  customerId: z.string(),
  totalCents: z.number().int().nonnegative(),
  currency: z.string().length(3),
});

export async function handleOrderCreated(raw: unknown, log: Logger): Promise<void> {
  const e = event.parse(raw);
  await upsertOrder({ id: e.orderId, customerId: e.customerId, totalCents: e.totalCents, currency: e.currency, status: "created" });
  await publishAnalytics("order_created", { orderId: e.orderId, value: e.totalCents / 100, currency: e.currency });
  log.info({ orderId: e.orderId }, "order created");
}
