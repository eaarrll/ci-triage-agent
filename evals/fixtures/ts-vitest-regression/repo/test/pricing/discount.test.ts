import { describe, expect, it } from "vitest";
import { applyDiscount, qualifiesForVolumeDiscount } from "../../src/pricing/discount.js";
import type { Cart, CartItem } from "../../src/pricing/types.js";

function item(unitPrice: number, quantity = 1): CartItem {
  return { sku: `SKU-${unitPrice}`, unitPrice, quantity };
}

function cartOf(...items: CartItem[]): Cart {
  return { id: "cart_test", currency: "USD", items };
}

describe("applyDiscount", () => {
  it("never discounts an empty cart", () => {
    expect(applyDiscount(cartOf())).toEqual({ subtotal: 0, discount: 0, total: 0 });
  });

  it.each([
    { subtotal: 20, total: 20 },
    { subtotal: 99.99, total: 99.99 },
    { subtotal: 100, total: 90 },
    { subtotal: 100.01, total: 90.01 },
    { subtotal: 250, total: 225 },
  ])("charges $total for a $subtotal subtotal", ({ subtotal, total }) => {
    expect(applyDiscount(cartOf(item(subtotal))).total).toBe(total);
  });

  it("multiplies quantities before discounting", () => {
    expect(applyDiscount(cartOf(item(40, 3)))).toEqual({ subtotal: 120, discount: 12, total: 108 });
  });
});

describe("qualifiesForVolumeDiscount", () => {
  it("is false for small orders", () => {
    expect(qualifiesForVolumeDiscount(49.5)).toBe(false);
  });

  it("is true for large orders", () => {
    expect(qualifiesForVolumeDiscount(180)).toBe(true);
  });
});
