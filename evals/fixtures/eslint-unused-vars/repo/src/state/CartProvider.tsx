import { useMemo, useState, type ReactNode } from "react";
import { CartContext, type CartLine, type CartState } from "./cart-context";

interface CartProviderProps {
  children: ReactNode;
  initialLines?: CartLine[];
}

export function CartProvider({ children, initialLines = [] }: CartProviderProps) {
  const [lines, setLines] = useState(initialLines);

  const value = useMemo<CartState>(() => {
    const subtotal = lines.reduce((sum, line) => sum + line.unitPrice * line.quantity, 0);
    const compareAtSubtotal = lines.reduce(
      (sum, line) => sum + (line.compareAtPrice ?? line.unitPrice) * line.quantity,
      0,
    );
    return {
      lines,
      currency: "USD",
      subtotal,
      compareAtSubtotal,
      setQuantity: (sku, quantity) =>
        setLines((current) => current.map((line) => (line.sku === sku ? { ...line, quantity } : line))),
    };
  }, [lines]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}
