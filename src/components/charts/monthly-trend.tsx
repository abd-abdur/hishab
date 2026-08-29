import { memo } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { formatMoney, formatMoneyCompact } from "@/lib/money";

type MonthRow = { month: string; spendMinor: number; incomeMinor: number };

function monthLabel(month: string): string {
  const [year, m] = month.split("-");
  const date = new Date(Number(year), Number(m) - 1, 1);
  return date.toLocaleDateString("en-AE", { month: "short" });
}

export const MonthlyTrend = memo(function MonthlyTrend({
  data,
  currency = "AED",
}: {
  data: MonthRow[];
  currency?: string;
}) {
  return (
    <div className="h-64">
      <ResponsiveContainer width="100%" height="100%" debounce={150}>
        <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 8 }} barGap={2}>
          <CartesianGrid vertical={false} stroke="var(--border)" />
          <XAxis
            dataKey="month"
            tickFormatter={monthLabel}
            tickLine={false}
            axisLine={false}
            tick={{ fill: "var(--muted-foreground)", fontSize: 12 }}
          />
          <YAxis
            tickFormatter={(v: number) =>
              formatMoneyCompact(v, currency).replace(`${currency} `, "")
            }
            tickLine={false}
            axisLine={false}
            width={44}
            tick={{ fill: "var(--muted-foreground)", fontSize: 12 }}
          />
          <Tooltip
            cursor={{ fill: "var(--muted)" }}
            contentStyle={{
              backgroundColor: "var(--popover)",
              border: "1px solid var(--border)",
              borderRadius: 8,
              color: "var(--popover-foreground)",
              fontSize: 13,
            }}
            formatter={(value: number, name: string) => [
              formatMoney(value, currency),
              name === "incomeMinor" ? "Income" : "Spend",
            ]}
            labelFormatter={(label: string) => monthLabel(label)}
          />
          <Bar
            dataKey="incomeMinor"
            fill="var(--positive)"
            radius={[3, 3, 0, 0]}
            isAnimationActive={false}
          />
          <Bar
            dataKey="spendMinor"
            fill="var(--negative)"
            radius={[3, 3, 0, 0]}
            isAnimationActive={false}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
});
