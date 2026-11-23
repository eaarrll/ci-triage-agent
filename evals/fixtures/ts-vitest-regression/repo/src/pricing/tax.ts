import { roundMoney } from "./money.js";

const SALES_TAX_RATES: Readonly<Record<string, number>> = {
  "US-CA": 0.0725,
  "US-NY": 0.04,
  "US-OR": 0,
  "US-TX": 0.0625,
  "US-WA": 0.065,
};

export function salesTaxRate(region: string): number {
  const rate = SALES_TAX_RATES[region];
  if (rate === undefined) {
    throw new Error(`No sales tax rate configured for region ${region}`);
  }
  return rate;
}

export function salesTax(amount: number, region: string): number {
  return roundMoney(amount * salesTaxRate(region));
}
