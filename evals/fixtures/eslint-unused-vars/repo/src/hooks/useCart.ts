import { useContext } from "react";
import { CartContext, type CartState } from "../state/cart-context";

export function useCart(): CartState {
  const cart = useContext(CartContext);
  if (!cart) {
    throw new Error("useCart must be used inside <CartProvider>");
  }
  return cart;
}
