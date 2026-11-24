import pg from "pg";

export interface ConnectOptions {
  maxAttempts?: number;
  baseDelayMs?: number;
  connect?: () => Promise<pg.PoolClient>;
}

/** Connects with exponential backoff; the database container can take a few seconds to accept connections. */
export async function connectWithRetry(pool: pg.Pool, opts: ConnectOptions = {}): Promise<pg.PoolClient> {
  const maxAttempts = opts.maxAttempts ?? 5;
  const baseDelayMs = opts.baseDelayMs ?? 250;
  const connect = opts.connect ?? (() => pool.connect());
  for (let attempt = 1; ; attempt++) {
    try {
      return await connect();
    } catch (error) {
      if (attempt >= maxAttempts) {
        console.error(`[db] giving up after ${attempt} attempts: ${String(error)}`);
        throw error;
      }
      const delay = baseDelayMs * 2 ** (attempt - 1);
      console.error(`[db] connection attempt ${attempt} failed: ${String(error)} (retrying in ${delay}ms)`);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
}
