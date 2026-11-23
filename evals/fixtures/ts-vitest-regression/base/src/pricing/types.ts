export type Currency = "USD" | "EUR" | "GBP";

export interface CartItem {
  sku: string;
  unitPrice: number;
  quantity: number;
}

export interface Cart {
  id: string;
  currency: Currency;
  items: CartItem[];
}

export interface PricedCart {
  subtotal: number;
  discount: number;
  total: number;
}
