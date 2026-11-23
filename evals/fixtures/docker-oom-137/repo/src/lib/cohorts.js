import { z } from "zod";
import { apiGet } from "./api";

const CohortResponse = z.object({
  cohorts: z.array(z.string()),
  periods: z.array(z.number().int().nonnegative()),
  retention: z.array(z.array(z.number().min(0).max(1).nullable())),
  revenue_by_month: z.array(z.object({ month: z.string(), revenue: z.number() })),
});

/**
 * @typedef {object} CohortMatrix
 * @property {string[]} cohorts
 * @property {number[]} periods
 * @property {(number | null)[][]} retention
 * @property {{ month: string, revenue: number }[]} revenueByMonth
 */

/** @returns {Promise<CohortMatrix>} */
export async function fetchCohorts({ months }) {
  const parsed = CohortResponse.parse(await apiGet(`/v2/reports/cohorts?months=${months}`));
  return {
    cohorts: parsed.cohorts,
    periods: parsed.periods,
    retention: parsed.retention,
    revenueByMonth: parsed.revenue_by_month,
  };
}
