export interface Plan {
  id: string;
  /** Monthly price in cents. */
  priceCents: number;
}

export interface Subscription {
  id: string;
  customerId: string;
  plan: Plan;
  periodStart: Date;
  periodEnd: Date;
}

export interface InvoiceLine {
  description: string;
  amountCents: number;
}
