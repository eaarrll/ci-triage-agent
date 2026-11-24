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

export interface Adjustment {
  sku: string;
  warehouse: string;
  delta: number;
}

/** Applies every adjustment in one transaction: all of them, or none if any would go negative. */
export async function adjustStockBulk(db: Pool, adjustments: Adjustment[]): Promise<number[]> {
  const client = await db.connect();
  try {
    await client.query("begin");
    const levels: number[] = [];
    for (const { sku, warehouse, delta } of adjustments) {
      const { rows } = await client.query(
        "update stock set on_hand = on_hand + $3 where sku = $1 and warehouse = $2 and on_hand + $3 >= 0 returning on_hand",
        [sku, warehouse, delta],
      );
      if (rows.length === 0) throw new Error(`cannot adjust ${sku}@${warehouse} by ${delta}`);
      levels.push(rows[0].on_hand);
    }
    await client.query("commit");
    return levels;
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}
