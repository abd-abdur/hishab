import { memo, useMemo } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { CategoryDot } from "@/components/app/category-icon";
import { chartColor } from "@/lib/categories";
import { formatMoney, toMajorUnits } from "@/lib/money";

export type CategoryTrendRow = {
  month: string; // "2026-08"
  categoryId: string;
  name: string;
  color: string;
  spendMinor: number;
};

const axisFormatter = new Intl.NumberFormat("en-AE", {
  notation: "compact",
  maximumFractionDigits: 1,
});

function monthLabel(month: string): string {
  const [year, m] = month.split("-");
  return new Date(Number(year), Number(m) - 1, 1).toLocaleDateString("en-AE", { month: "short" });
}

const TOP_CATEGORIES = 6;

/**
 * Where the money went, month by month: stacked bars of the top categories
 * with everything else folded into a muted "Other". Colors are the stored
 * per-category slots, so they match every other view.
 */
export const CategoryStackedTrend = memo(function CategoryStackedTrend({
  data,
  currency = "AED",
}: {
  data: CategoryTrendRow[];
  currency?: string;
}) {
  const { rows, series } = useMemo(() => {
    const totals = new Map<string, { name: string; color: string; total: number }>();
    for (const r of data) {
      const t = totals.get(r.categoryId) ?? { name: r.name, color: r.color, total: 0 };
      t.total += Math.max(0, r.spendMinor);
      totals.set(r.categoryId, t);
    }
    const ranked = [...totals.entries()].sort((a, b) => b[1].total - a[1].total);
    const top = ranked.slice(0, TOP_CATEGORIES);
    const topIds = new Set(top.map(([id]) => id));
    const hasOther = ranked.length > TOP_CATEGORIES;

    const months = [...new Set(data.map((r) => r.month))].sort();
    const rows = months.map((month) => {
      const row: Record<string, number | string> = { month };
      let other = 0;
      for (const r of data) {
        if (r.month !== month) continue;
        if (topIds.has(r.categoryId)) {
          row[r.categoryId] = Math.max(0, r.spendMinor);
        } else {
          other += Math.max(0, r.spendMinor);
        }
      }
      if (hasOther) row["other"] = other;
      return row;
    });

    const series = [
      ...top.map(([id, t]) => ({ id, name: t.name, color: t.color })),
      ...(hasOther ? [{ id: "other", name: "Other", color: "chart-10" }] : []),
    ];
    return { rows, series };
  }, [data]);

  if (rows.length === 0) return null;

  return (
    <div>
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%" debounce={150}>
          <BarChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
            <CartesianGrid vertical={false} stroke="var(--border)" />
            <XAxis
              dataKey="month"
              tickFormatter={monthLabel}
              tickLine={false}
              axisLine={false}
              tick={{ fill: "var(--muted-foreground)", fontSize: 12 }}
            />
            <YAxis
              tickFormatter={(v: number) => axisFormatter.format(toMajorUnits(v, currency))}
              tickLine={false}
              axisLine={false}
              width={48}
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
                series.find((s) => s.id === name)?.name ?? name,
              ]}
              labelFormatter={(label: string) => monthLabel(label)}
            />
            {series.map((s, index) => (
              <Bar
                key={s.id}
                dataKey={s.id}
                stackId="spend"
                fill={chartColor(s.color)}
                radius={index === series.length - 1 ? [3, 3, 0, 0] : 0}
                isAnimationActive={false}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
        {series.map((s) => (
          <span key={s.id} className="flex items-center gap-1.5">
            <CategoryDot color={s.color} />
            {s.name}
          </span>
        ))}
      </div>
    </div>
  );
});
