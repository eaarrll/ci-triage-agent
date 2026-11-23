import { CohortHeatmap } from "@/components/charts/CohortHeatmap";
import { RevenueTrend } from "@/components/charts/RevenueTrend";
import { fetchCohorts } from "@/lib/cohorts";

export const revalidate = 3600;

export default async function CohortsPage() {
  const matrix = await fetchCohorts({ months: 12 });
  return (
    <section className="space-y-6">
      <h1 className="text-xl font-semibold">Revenue cohorts</h1>
      <CohortHeatmap matrix={matrix} />
      <RevenueTrend series={matrix.revenueByMonth} />
    </section>
  );
}
