import { describe, expect, it } from "vitest";
import { createOrderSchema } from "../../src/orders/order-schema.js";

const valid = {
  customerId: "cus_8Hq2",
  currency: "USD",
  region: "US-CA",
  lines: [{ sku: "TEE-BLK-M", quantity: 2 }],
};

describe("createOrderSchema", () => {
  it("accepts a well-formed request", () => {
    expect(createOrderSchema.safeParse(valid).success).toBe(true);
  });

  it("rejects an order without lines", () => {
    expect(createOrderSchema.safeParse({ ...valid, lines: [] }).success).toBe(false);
  });

  it("rejects lowercase skus", () => {
    expect(createOrderSchema.safeParse({ ...valid, lines: [{ sku: "tee-blk-m", quantity: 1 }] }).success).toBe(false);
  });

  it("rejects a zero quantity", () => {
    expect(createOrderSchema.safeParse({ ...valid, lines: [{ sku: "TEE-BLK-M", quantity: 0 }] }).success).toBe(false);
  });

  it("rejects unsupported currencies", () => {
    expect(createOrderSchema.safeParse({ ...valid, currency: "JPY" }).success).toBe(false);
  });

  it("rejects malformed regions", () => {
    expect(createOrderSchema.safeParse({ ...valid, region: "California" }).success).toBe(false);
  });

  it("caps an order at 50 lines", () => {
    const lines = Array.from({ length: 51 }, () => ({ sku: "MUG-12OZ", quantity: 1 }));
    expect(createOrderSchema.safeParse({ ...valid, lines }).success).toBe(false);
  });
});
