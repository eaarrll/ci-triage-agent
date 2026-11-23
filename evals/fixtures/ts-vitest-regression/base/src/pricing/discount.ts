import { roundMoney, sumMoney } from "./money.js";
import type { Cart, PricedCart } from "./types.js";

const VOLUME_DISCOUNT_THRESHOLD = 100;
const VOLUME_DISCOUNT_RATE = 0.1;

/** Orders at or above the threshold get the volume discount. */
export function qualifiesForVolumeDiscount(subtotal: number): boolean {
  return subtotal >= VOLUME_DISCOUNT_THRESHOLD;
}

export function applyDiscount(cart: Cart): PricedCart {
  const subtotal = sumMoney(cart.items.map((item) => item.unitPrice * item.quantity));
  const discount = qualifiesForVolumeDiscount(subtotal) ? roundMoney(subtotal * VOLUME_DISCOUNT_RATE) : 0;
  return { subtotal, discount, total: roundMoney(subtotal - discount) };
}
