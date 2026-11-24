import type { Pool } from "pg";

export interface StockLevel {
  sku: string;
  warehouse: string;
  onHand: number;
}

export async function getStock(db: Pool, sku: string): Promise<StockLevel[]> {
  const { rows } = await db.query(
    "select sku, warehouse, on_hand as \"onHand\" from stock where sku = $1 order by warehouse",
    [sku],
  );
  return rows;
}

export async function adjustStock(db: Pool, sku: string, warehouse: string, delta: number): Promise<number> {
  const { rows } = await db.query(
    "update stock set on_hand = on_hand + $3 where sku = $1 and warehouse = $2 and on_hand + $3 >= 0 returning on_hand",
    [sku, warehouse, delta],
  );
  if (rows.length === 0) throw new Error(`cannot adjust ${sku}@${warehouse} by ${delta}`);
  return rows[0].on_hand;
}
