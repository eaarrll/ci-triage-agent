import type { InvoiceLine, Plan, Subscription } from "./types.js";
import { remainingDays, unusedCredit, upgradeCharge } from "./proration.js";

/** Invoice lines for a plan change at `changeAt`. */
export function planChangeLines(sub: Subscription, next: Plan, changeAt: Date): InvoiceLine[] {
  const credit = unusedCredit(sub, changeAt);
  const charge = upgradeCharge(sub, next, changeAt) + credit;
  const days = remainingDays(sub, changeAt);
  return [
    { description: `Unused time on ${sub.plan.id} (${days} days remaining)`, amountCents: -credit },
    { description: `Remaining time on ${next.id} (${days} days remaining)`, amountCents: charge },
  ];
}

export function totalCents(lines: InvoiceLine[]): number {
  return lines.reduce((sum, line) => sum + line.amountCents, 0);
}
