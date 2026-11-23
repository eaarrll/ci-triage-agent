import { RevenueTrend } from "@/components/charts/RevenueTrend";
import { apiGet } from "@/lib/api";

export const revalidate = 3600;

export default async function RevenuePage() {
  const series = await apiGet("/v2/reports/revenue?months=12");
  return (
    <section className="space-y-6">
      <h1 className="text-xl font-semibold">Revenue</h1>
      <RevenueTrend series={series} />
    </section>
  );
}
