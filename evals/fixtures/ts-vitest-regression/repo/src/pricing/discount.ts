import { pricingConfig } from "../config.js";
import { roundMoney, sumMoney } from "./money.js";
import type { Cart, PricedCart } from "./types.js";

/** Orders at or above the threshold get the volume discount. */
export function qualifiesForVolumeDiscount(subtotal: number): boolean {
  return subtotal > pricingConfig.volumeDiscount.threshold;
}

export function applyDiscount(cart: Cart): PricedCart {
  const { rate } = pricingConfig.volumeDiscount;
  const subtotal = sumMoney(cart.items.map((item) => item.unitPrice * item.quantity));
  const discount = qualifiesForVolumeDiscount(subtotal) ? roundMoney(subtotal * rate) : 0;
  return { subtotal, discount, total: roundMoney(subtotal - discount) };
}
