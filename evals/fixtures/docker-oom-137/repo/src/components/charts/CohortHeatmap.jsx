"use client";

import Plot from "react-plotly.js";

/** @param {{ matrix: import("@/lib/cohorts").CohortMatrix, height?: number }} props */
export function CohortHeatmap({ matrix, height = 480 }) {
  return (
    <Plot
      data={[
        {
          type: "heatmap",
          z: matrix.retention,
          x: matrix.periods.map((p) => `M+${p}`),
          y: matrix.cohorts,
          colorscale: "Blues",
          hovertemplate: "%{y} / %{x}: %{z:.1%}<extra></extra>",
        },
      ]}
      layout={{ height, margin: { l: 80, r: 16, t: 16, b: 40 }, yaxis: { autorange: "reversed" } }}
      config={{ displayModeBar: false, responsive: true }}
      style={{ width: "100%" }}
    />
  );
}
