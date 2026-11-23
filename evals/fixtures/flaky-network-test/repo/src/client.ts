import { RatesApiError } from "./errors.js";
import { parseRates, type RatesResponse } from "./parse.js";

export interface RatesClientOptions {
  baseUrl: string;
  apiKey: string;
  /** Per-request timeout in milliseconds. */
  timeoutMs?: number;
  /** Retries for 429/5xx responses. Timeouts and network errors are not retried. */
  retries?: number;
  fetch?: typeof fetch;
}

export interface RatesQuery {
  base: string;
  symbols?: string[];
}

const RETRYABLE = new Set([429, 500, 502, 503, 504]);

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function isTimeout(err: unknown): boolean {
  return err instanceof DOMException && err.name === "TimeoutError";
}

export class RatesClient {
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly timeoutMs: number;
  private readonly retries: number;
  private readonly fetchImpl: typeof fetch;
  private readonly etags = new Map<string, { etag: string; body: unknown }>();

  constructor(opts: RatesClientOptions) {
    this.baseUrl = opts.baseUrl.replace(/\/+$/, "");
    this.apiKey = opts.apiKey;
    this.timeoutMs = opts.timeoutMs ?? 5000;
    this.retries = opts.retries ?? 1;
    this.fetchImpl = opts.fetch ?? fetch;
  }

  async latest(query: RatesQuery): Promise<RatesResponse> {
    return parseRates(await this.request(`/v2/latest?${toParams(query)}`));
  }

  async historical(date: string, query: RatesQuery): Promise<RatesResponse> {
    return parseRates(await this.request(`/v2/${date}?${toParams(query)}`));
  }

  async currencies(): Promise<Record<string, string>> {
    return (await this.request("/v2/currencies")) as Record<string, string>;
  }

  private async request(path: string, attempt = 0): Promise<unknown> {
    const url = `${this.baseUrl}${path}`;
    const cached = this.etags.get(url);
    let res: Response;
    try {
      res = await this.fetchImpl(url, {
        headers: {
          authorization: `Bearer ${this.apiKey}`,
          accept: "application/json",
          ...(cached ? { "if-none-match": cached.etag } : {}),
        },
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (err) {
      if (isTimeout(err)) {
        throw new RatesApiError(`GET ${url} failed: request timed out after ${this.timeoutMs}ms`, {
          cause: err,
        });
      }
      console.error(`[fx-rates] request failed: ${String(err)}`);
      throw new RatesApiError(`GET ${url} failed: ${(err as Error).message}`, { cause: err });
    }

    if (res.status === 304 && cached) return cached.body;
    if (RETRYABLE.has(res.status) && attempt < this.retries) {
      const delay = 50 * 2 ** attempt;
      console.warn(`[fx-rates] upstream returned ${res.status} for GET ${path}, retrying in ${delay}ms`);
      await sleep(delay);
      return this.request(path, attempt + 1);
    }
    if (!res.ok) {
      throw new RatesApiError(`GET ${url} failed: HTTP ${res.status}`, { status: res.status });
    }

    const body: unknown = await res.json();
    const etag = res.headers.get("etag");
    if (etag) this.etags.set(url, { etag, body });
    return body;
  }
}

function toParams({ base, symbols }: RatesQuery): URLSearchParams {
  const params = new URLSearchParams({ base });
  if (symbols?.length) params.set("symbols", symbols.join(","));
  return params;
}
