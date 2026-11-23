import type { CartLine } from "../state/cart-context";
import { formatCurrency } from "../lib/format";

interface CartLineItemProps {
  line: CartLine;
  currency: string;
}

export function CartLineItem({ line, currency }: CartLineItemProps) {
  return (
    <li className="cart-line">
      <span className="cart-line__title">{line.title}</span>
      <span className="cart-line__quantity">× {line.quantity}</span>
      <span className="cart-line__price">{formatCurrency(line.unitPrice * line.quantity, currency)}</span>
    </li>
  );
}
