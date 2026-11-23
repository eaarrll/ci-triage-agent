import { beforeEach, describe, expect, it } from "vitest";
import { catalog } from "../../src/orders/catalog.js";
import type { CreateOrderRequest } from "../../src/orders/order-schema.js";
import { OrderService, UnknownSkuError } from "../../src/orders/order-service.js";

function request(region: string, ...lines: Array<[string, number]>): CreateOrderRequest {
  return {
    customerId: "cus_test",
    currency: "USD",
    region,
    lines: lines.map(([sku, quantity]) => ({ sku, quantity })),
  };
}

describe("OrderService.quote", () => {
  let service: OrderService;

  beforeEach(() => {
    service = new OrderService(catalog);
  });

  it("prices a single line", () => {
    expect(service.quote("ord_1", request("US-OR", ["TEE-BLK-M", 1])).total).toBe(24);
  });

  it("multiplies unit price by quantity", () => {
    expect(service.quote("ord_2", request("US-OR", ["MUG-12OZ", 3])).subtotal).toBe(42.75);
  });

  it("applies sales tax after the discount", () => {
    const quote = service.quote("ord_3", request("US-CA", ["HOODIE-GRY-L", 2]));
    expect(quote).toMatchObject({ subtotal: 119, discount: 11.9, tax: 7.76, total: 114.86 });
  });

  it("adds tax for the order region", () => {
    expect(service.quote("ord_4", request("US-NY", ["TEE-BLK-M", 2])).total).toBe(49.92);
  });

  it("leaves small orders undiscounted", () => {
    expect(service.quote("ord_5", request("US-OR", ["MUG-12OZ", 4])).discount).toBe(0);
  });

  it("sums several lines", () => {
    const quote = service.quote("ord_6", request("US-OR", ["TEE-BLK-M", 1], ["HOODIE-GRY-L", 1], ["MUG-12OZ", 2]));
    expect(quote).toMatchObject({ subtotal: 112, discount: 11.2, total: 100.8 });
  });

  it("rejects unknown skus", () => {
    expect(() => service.quote("ord_7", request("US-OR", ["NOPE-404", 1]))).toThrow(UnknownSkuError);
  });

  it("rejects inactive skus", () => {
    expect(() => service.quote("ord_8", request("US-OR", ["CAP-RETRO", 1]))).toThrow(UnknownSkuError);
  });

  it("throws for regions without a tax rate", () => {
    expect(() => service.quote("ord_9", request("US-ZZ", ["TEE-BLK-M", 1]))).toThrow(/US-ZZ/);
  });

  it("echoes the order id", () => {
    expect(service.quote("ord_10", request("US-OR", ["TEE-WHT-L", 1])).orderId).toBe("ord_10");
  });
});
