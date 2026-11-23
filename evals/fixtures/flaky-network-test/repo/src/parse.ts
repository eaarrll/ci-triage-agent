import { RatesApiError } from "./errors.js";

export interface RatesResponse {
  base: string;
  date: string;
  rates: Record<string, number>;
}

export function parseRates(body: unknown): RatesResponse {
  if (typeof body !== "object" || body === null) throw new RatesApiError("rates response is not an object");
  const { base, date, rates } = body as Record<string, unknown>;
  if (typeof base !== "string" || typeof date !== "string" || typeof rates !== "object" || rates === null) {
    throw new RatesApiError("rates response is missing base, date or rates");
  }
  for (const [code, value] of Object.entries(rates)) {
    if (typeof value !== "number" || !Number.isFinite(value)) {
      throw new RatesApiError(`rate for ${code} is not a finite number`);
    }
  }
  return { base, date, rates: rates as Record<string, number> };
}
