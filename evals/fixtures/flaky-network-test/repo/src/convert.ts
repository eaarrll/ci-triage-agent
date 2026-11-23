import type { RatesResponse } from "./parse.js";

/** Convert `amount` from `from` to `to` using a single rates table (cross rates via the base). */
export function convert(amount: number, from: string, to: string, table: RatesResponse): number {
  if (from === to) return amount;
  const rate = (code: string): number => {
    if (code === table.base) return 1;
    const r = table.rates[code];
    if (r === undefined) throw new RangeError(`no rate for ${code} in ${table.base} table`);
    return r;
  };
  return roundHalfEven((amount / rate(from)) * rate(to), minorUnits(to));
}

export function minorUnits(code: string): number {
  return ["JPY", "KRW", "CLP", "ISK"].includes(code) ? 0 : ["BHD", "KWD", "OMR"].includes(code) ? 3 : 2;
}

export function roundHalfEven(value: number, digits: number): number {
  const f = 10 ** digits;
  const n = value * f;
  const floor = Math.floor(n);
  const diff = n - floor;
  const rounded = Math.abs(diff - 0.5) < 1e-9 ? (floor % 2 === 0 ? floor : floor + 1) : Math.round(n);
  return rounded / f;
}
