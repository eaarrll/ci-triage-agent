/** Rounds to whole cents. EPSILON nudges values such as 1.005 that are stored as 1.00499... */
export function roundMoney(amount: number): number {
  return Math.round((amount + Number.EPSILON) * 100) / 100;
}

export function sumMoney(amounts: readonly number[]): number {
  return roundMoney(amounts.reduce((total, amount) => total + amount, 0));
}

export function formatMoney(amount: number, currency: string): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(amount);
}
