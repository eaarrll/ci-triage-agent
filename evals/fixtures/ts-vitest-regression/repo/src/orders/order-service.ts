import { applyDiscount } from "../pricing/discount.js";
import { roundMoney } from "../pricing/money.js";
import { salesTax } from "../pricing/tax.js";
import type { Cart, CartItem } from "../pricing/types.js";
import type { CreateOrderRequest } from "./order-schema.js";

export interface CatalogEntry {
  sku: string;
  unitPrice: number;
  active: boolean;
}

export interface Catalog {
  find(sku: string): CatalogEntry | undefined;
}

export interface OrderQuote {
  orderId: string;
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
}

export class UnknownSkuError extends Error {
  readonly sku: string;

  constructor(sku: string) {
    super(`unknown sku ${sku}`);
    this.name = "UnknownSkuError";
    this.sku = sku;
  }
}

type Logger = Pick<Console, "info" | "warn">;

export class OrderService {
  private readonly catalog: Catalog;
  private readonly logger: Logger;

  constructor(catalog: Catalog, logger: Logger = console) {
    this.catalog = catalog;
    this.logger = logger;
  }

  quote(orderId: string, request: CreateOrderRequest): OrderQuote {
    const items = request.lines.map((line) => this.toCartItem(orderId, line.sku, line.quantity));
    const cart: Cart = { id: orderId, currency: request.currency, items };
    const priced = applyDiscount(cart);
    const tax = salesTax(priced.total, request.region);
    this.logger.info(`[orders] quoted ${orderId}: ${items.length} line(s), total ${priced.total}`);
    return { orderId, ...priced, tax, total: roundMoney(priced.total + tax) };
  }

  private toCartItem(orderId: string, sku: string, quantity: number): CartItem {
    const entry = this.catalog.find(sku);
    if (!entry || !entry.active) {
      this.logger.warn(`[orders] rejected ${orderId}: unknown or inactive sku ${sku}`);
      throw new UnknownSkuError(sku);
    }
    return { sku, unitPrice: entry.unitPrice, quantity };
  }
}
