import type { CartLine } from "../state/cart-context";
import { Money } from "./Money";

interface CartLineItemProps {
  line: CartLine;
  currency: string;
}

export function CartLineItem({ line, currency }: CartLineItemProps) {
  return (
    <li className="cart-line">
      <span className="cart-line__title">{line.title}</span>
      <span className="cart-line__quantity">× {line.quantity}</span>
      {line.compareAtPrice !== null && (
        <s className="cart-line__compare-at">
          <Money amount={line.compareAtPrice * line.quantity} currency={currency} />
        </s>
      )}
      <Money className="cart-line__price" amount={line.unitPrice * line.quantity} currency={currency} />
    </li>
  );
}
