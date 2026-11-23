import { createContext } from "react";

export interface CartLine {
  sku: string;
  title: string;
  quantity: number;
  unitPrice: number;
  compareAtPrice: number | null;
}

export interface CartState {
  lines: CartLine[];
  currency: string;
  subtotal: number;
  compareAtSubtotal: number;
  setQuantity(sku: string, quantity: number): void;
}

export const CartContext = createContext<CartState | null>(null);
