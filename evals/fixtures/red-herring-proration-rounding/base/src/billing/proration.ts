import type { Plan, Subscription } from "./types.js";

/**
 * Credit, in cents, for the unused part of the current billing period when a
 * subscription changes plan at `changeAt`. Proration is by the exact time left in
 * the period, rounded half-up to the cent (see docs/billing.md).
 */
export function unusedCredit(sub: Subscription, changeAt: Date): number {
  return Math.round((sub.plan.priceCents * remainingMs(sub, changeAt)) / periodMs(sub));
}

/** What the customer pays now when moving to `next` at `changeAt`, in cents. */
export function upgradeCharge(sub: Subscription, next: Plan, changeAt: Date): number {
  const newCost = Math.round((next.priceCents * remainingMs(sub, changeAt)) / periodMs(sub));
  return Math.max(0, newCost - unusedCredit(sub, changeAt));
}

function periodMs(sub: Subscription): number {
  return sub.periodEnd.getTime() - sub.periodStart.getTime();
}

function remainingMs(sub: Subscription, at: Date): number {
  return Math.min(periodMs(sub), Math.max(0, sub.periodEnd.getTime() - at.getTime()));
}
