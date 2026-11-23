import { useState } from "react";
import { CartLineItem } from "./components/CartLineItem";
import { CartSummary } from "./components/CartSummary";
import { useCart } from "./hooks/useCart";
import { CartProvider } from "./state/CartProvider";

function CartPage() {
  const { lines, currency } = useCart();
  const [postalCode, setPostalCode] = useState<string | null>(null);

  return (
    <main className="cart-page">
      <ul className="cart-lines">
        {lines.map((line) => (
          <CartLineItem key={line.sku} line={line} currency={currency} />
        ))}
      </ul>
      <label>
        Postal code
        <input onBlur={(event) => setPostalCode(event.target.value.trim() || null)} />
      </label>
      <CartSummary postalCode={postalCode} onCheckout={() => window.location.assign("/checkout")} />
    </main>
  );
}

export function App() {
  return (
    <CartProvider>
      <CartPage />
    </CartProvider>
  );
}
