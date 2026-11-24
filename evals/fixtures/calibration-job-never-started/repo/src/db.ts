import pg from "pg";

export function createPool(): pg.Pool {
  return new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 5 });
}
