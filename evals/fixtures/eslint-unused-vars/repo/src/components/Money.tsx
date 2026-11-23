import { formatCurrency } from "../lib/format";

interface MoneyProps {
  amount: number;
  currency: string;
  className?: string;
}

export function Money({ amount, currency, className }: MoneyProps) {
  return (
    <span className={className} data-negative={amount < 0 || undefined}>
      {formatCurrency(amount, currency)}
    </span>
  );
}
