import { z } from "zod";

export const orderLineSchema = z.object({
  sku: z.string().regex(/^[A-Z0-9-]{3,32}$/),
  quantity: z.number().int().min(1).max(99),
});

export const createOrderSchema = z.object({
  customerId: z.string().startsWith("cus_"),
  currency: z.enum(["USD", "EUR", "GBP"]),
  region: z.string().regex(/^[A-Z]{2}-[A-Z]{2}$/),
  lines: z.array(orderLineSchema).min(1).max(50),
});

export type CreateOrderRequest = z.infer<typeof createOrderSchema>;
