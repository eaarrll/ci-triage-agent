import { readdir, readFile } from "node:fs/promises";
import pg from "pg";

const url = new URL(process.env.DATABASE_URL);
const client = new pg.Client({ connectionString: url.toString() });
await client.connect();
url.password = "***";
console.log(`[migrate] connected to ${url}`);
await client.query("create table if not exists schema_migrations (name text primary key, applied_at timestamptz default now())");
const done = new Set((await client.query("select name from schema_migrations")).rows.map((r) => r.name));
let applied = 0;
for (const name of (await readdir("migrations")).sort()) {
  if (done.has(name)) continue;
  await client.query(await readFile(`migrations/${name}`, "utf8"));
  await client.query("insert into schema_migrations (name) values ($1)", [name]);
  console.log(`[migrate] applied ${name}`);
  applied++;
}
console.log(`[migrate] ${applied} migrations applied`);
await client.end();
