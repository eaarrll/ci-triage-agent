import { describe, expect, it } from "vitest";
import pg from "pg";
import { connectWithRetry } from "../../src/db/pool.js";

const timeout = () => Object.assign(new Error("connect ETIMEDOUT 10.0.4.17:5432"), { code: "ETIMEDOUT" });
const refused = () => Object.assign(new Error("connect ECONNREFUSED 127.0.0.1:5433"), { code: "ECONNREFUSED" });

describe("connectWithRetry", () => {
  it("retries until the database accepts connections", async () => {
    let calls = 0;
    const client = {} as pg.PoolClient;
    const connect = async () => {
      calls++;
      if (calls < 3) throw timeout();
      return client;
    };
    await expect(connectWithRetry(new pg.Pool(), { connect, baseDelayMs: 50 })).resolves.toBe(client);
    expect(calls).toBe(3);
  });

  it("gives up after maxAttempts", async () => {
    const connect = async () => {
      throw refused();
    };
    await expect(connectWithRetry(new pg.Pool(), { connect, maxAttempts: 3, baseDelayMs: 50 })).rejects.toThrow(
      "ECONNREFUSED",
    );
  });

  it("connects to the test database", async () => {
    const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
    const client = await connectWithRetry(pool);
    const { rows } = await client.query("select 1 as ok");
    expect(rows[0].ok).toBe(1);
    client.release();
    await pool.end();
  });
});
