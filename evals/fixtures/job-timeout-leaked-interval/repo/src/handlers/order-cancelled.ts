import type { Logger } from "pino";
import { z } from "zod";
import { setOrderStatus } from "../store/orders";
import { metrics } from "../metrics";

const event = z.object({
  type: z.literal("order.cancelled"),
  orderId: z.string(),
  reason: z.enum(["customer", "payment_failed", "fraud", "out_of_stock"]),
});

export async function handleOrderCancelled(raw: unknown, log: Logger): Promise<void> {
  const e = event.parse(raw);
  await setOrderStatus(e.orderId, "cancelled");
  metrics.increment(`orders.cancelled.${e.reason}`);
  log.info({ orderId: e.orderId, reason: e.reason }, "order cancelled");
}
