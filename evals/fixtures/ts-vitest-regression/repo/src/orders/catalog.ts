import type { Catalog, CatalogEntry } from "./order-service.js";

const ENTRIES: readonly CatalogEntry[] = [
  { sku: "TEE-BLK-M", unitPrice: 24, active: true },
  { sku: "TEE-WHT-L", unitPrice: 24, active: true },
  { sku: "HOODIE-GRY-L", unitPrice: 59.5, active: true },
  { sku: "MUG-12OZ", unitPrice: 14.25, active: true },
  { sku: "CAP-RETRO", unitPrice: 19.99, active: false },
];

export const catalog: Catalog = {
  find: (sku) => ENTRIES.find((entry) => entry.sku === sku),
};
