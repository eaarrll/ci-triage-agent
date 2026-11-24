import pg from "pg";
import { readFile } from "node:fs/promises";

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
await client.query(await readFile("migrations/001_stock.sql", "utf8"));
await client.end();
console.log("migrated");
