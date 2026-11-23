"use client";

import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

export function RevenueTrend({ series }) {
  return (
    <ResponsiveContainer width="100%" height={240}>
      <LineChart data={series}>
        <XAxis dataKey="month" tickLine={false} />
        <YAxis tickFormatter={(v) => `${Math.round(v / 1000)}k`} width={48} />
        <Tooltip formatter={(v) => usd.format(v)} />
        <Line type="monotone" dataKey="revenue" strokeWidth={2} dot={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}
