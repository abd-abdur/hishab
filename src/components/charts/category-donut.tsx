import { memo } from "react";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";

import { chartColor } from "@/lib/categories";
import { formatMoney } from "@/lib/money";

type Slice = { categoryId: string; name: string; color: string; spendMinor: number };

export const CategoryDonut = memo(function CategoryDonut({
  data,
  currency = "AED",
  centerLabel,
}: {
  data: Slice[];
  currency?: string;
  /** e.g. the period's total, shown in the donut's hole */
  centerLabel?: { title: string; value: number } | undefined;
}) {
  return (
    <div className="relative h-64">
      {centerLabel ? (
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-xs text-muted-foreground">{centerLabel.title}</span>
          <span className="num text-lg font-semibold">
            {formatMoney(centerLabel.value, currency)}
          </span>
        </div>
      ) : null}
      <ResponsiveContainer width="100%" height="100%" debounce={150}>
        <PieChart>
          <Pie
            data={data}
            dataKey="spendMinor"
            nameKey="name"
            innerRadius="62%"
            outerRadius="90%"
            paddingAngle={1.5}
            strokeWidth={0}
            isAnimationActive={false}
          >
            {data.map((slice) => (
              <Cell key={slice.categoryId} fill={chartColor(slice.color)} />
            ))}
          </Pie>
          <Tooltip
            contentStyle={{
              backgroundColor: "var(--popover)",
              border: "1px solid var(--border)",
              borderRadius: 8,
              color: "var(--popover-foreground)",
              fontSize: 13,
            }}
            formatter={(value: number, name: string) => [formatMoney(value, currency), name]}
          />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
});
