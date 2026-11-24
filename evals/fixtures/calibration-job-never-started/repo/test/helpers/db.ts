import { createPool } from "../../src/db.js";

const pool = createPool();

/** Replaces the stock table's contents with `rows`. */
export async function resetStock(rows: Array<{ sku: string; warehouse: string; onHand: number }>): Promise<void> {
  await pool.query("delete from stock");
  for (const { sku, warehouse, onHand } of rows) {
    await pool.query("insert into stock (sku, warehouse, on_hand) values ($1, $2, $3)", [sku, warehouse, onHand]);
  }
}
