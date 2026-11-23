import { useMemo } from "react";
import { useCart } from "../hooks/useCart";
import { useShippingQuote } from "../hooks/useShippingQuote";
import { formatCurrency } from "../lib/format";
import { Money } from "./Money";
import styles from "./CartSummary.module.css";

interface CartSummaryProps {
  postalCode: string | null;
  onCheckout: () => void;
}

export function CartSummary({ postalCode, onCheckout }: CartSummaryProps) {
  const { lines, currency, subtotal, compareAtSubtotal } = useCart();
  const shipping = useShippingQuote(postalCode, subtotal);

  const savings = useMemo(() => Math.max(0, compareAtSubtotal - subtotal), [compareAtSubtotal, subtotal]);
  const total = subtotal + (shipping.status === "ready" ? shipping.amount : 0);

  return (
    <section className={styles.summary} aria-labelledby="cart-summary-heading">
      <h2 id="cart-summary-heading">Order summary</h2>
      <dl className={styles.rows}>
        <div className={styles.row}>
          <dt>
            Subtotal ({lines.length} {lines.length === 1 ? "item" : "items"})
          </dt>
          <dd>
            <Money amount={subtotal} currency={currency} />
          </dd>
        </div>
        {savings > 0 && (
          <div className={`${styles.row} ${styles.savings}`}>
            <dt>You save</dt>
            <dd>
              <Money amount={-savings} currency={currency} />
            </dd>
          </div>
        )}
        <div className={styles.row}>
          <dt>Shipping</dt>
          <dd>
            {shipping.status === "ready" && <Money amount={shipping.amount} currency={currency} />}
            {shipping.status === "loading" && "Calculating…"}
            {shipping.status === "idle" && "Enter a postal code"}
            {shipping.status === "error" && "Unavailable"}
          </dd>
        </div>
        <div className={`${styles.row} ${styles.total}`}>
          <dt>Total</dt>
          <dd>
            <Money amount={total} currency={currency} />
          </dd>
        </div>
      </dl>
      <button type="button" className={styles.checkout} onClick={onCheckout} disabled={lines.length === 0}>
        Checkout
      </button>
    </section>
  );
}
