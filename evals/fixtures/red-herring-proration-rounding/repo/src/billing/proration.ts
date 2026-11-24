import { DAY_MS } from "../time.js";
import type { Plan, Subscription } from "./types.js";

/**
 * Credit, in cents, for the unused part of the current billing period when a
 * subscription changes plan at `changeAt`. Proration is by the exact time left in
 * the period, rounded half-up to the cent (see docs/billing.md).
 */
export function unusedCredit(sub: Subscription, changeAt: Date): number {
  return Math.round((sub.plan.priceCents * remainingDays(sub, changeAt)) / periodDays(sub));
}

/** What the customer pays now when moving to `next` at `changeAt`, in cents. */
export function upgradeCharge(sub: Subscription, next: Plan, changeAt: Date): number {
  const newCost = Math.round((next.priceCents * remainingDays(sub, changeAt)) / periodDays(sub));
  return Math.max(0, newCost - unusedCredit(sub, changeAt));
}

/** Length of the billing period in days. */
export function periodDays(sub: Subscription): number {
  return Math.round((sub.periodEnd.getTime() - sub.periodStart.getTime()) / DAY_MS);
}

/** Days left in the period, for the invoice line ("17 days remaining"). */
export function remainingDays(sub: Subscription, at: Date): number {
  const periodMs = sub.periodEnd.getTime() - sub.periodStart.getTime();
  const remainingMs = Math.min(periodMs, Math.max(0, sub.periodEnd.getTime() - at.getTime()));
  return Math.floor(remainingMs / DAY_MS);
}
