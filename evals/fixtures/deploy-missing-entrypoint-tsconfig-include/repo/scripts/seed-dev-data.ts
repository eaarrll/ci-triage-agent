import pg from "pg";
import { loadConfig } from "../src/config.js";

// Fills a local database with a few customers and orders for manual testing.
const config = loadConfig();
const client = new pg.Client({ connectionString: config.databaseUrl });
await client.connect();

const customers = ["ana", "ben", "cy", "dee"];
for (const [i, name] of customers.entries()) {
  await client.query("insert into customers (id, name) values ($1, $2) on conflict do nothing", [`cus_${i + 1}`, name]);
  for (let n = 1; n <= 3; n++) {
    await client.query(
      "insert into orders (id, customer_id, total_cents, status) values ($1, $2, $3, 'paid') on conflict do nothing",
      [`ord_${i + 1}_${n}`, `cus_${i + 1}`, 1000 * n + i * 250],
    );
  }
}
console.log(`seeded ${customers.length} customers and ${customers.length * 3} orders`);
await client.end();
