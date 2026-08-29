import { memo } from "react";

import { CategoryIcon } from "@/components/app/category-icon";
import { chartColor } from "@/lib/categories";
import { formatMoney } from "@/lib/money";

type CategoryBar = {
  categoryId: string;
  name: string;
  color: string;
  icon: string;
  spendMinor: number;
  limitMinor?: number | undefined;
};

/**
 * Horizontal category bars — clearer than a donut for comparing magnitudes.
 * A budget tick marks the limit when one exists.
 */
export const CategoryBars = memo(function CategoryBars({
  data,
  currency = "AED",
  onSelect,
}: {
  data: CategoryBar[];
  currency?: string;
  onSelect?: (categoryId: string) => void;
}) {
  const max = Math.max(...data.map((d) => Math.max(d.spendMinor, d.limitMinor ?? 0)), 1);
  return (
    <div className="space-y-3">
      {data.map((row) => {
        const widthPct = Math.max(1, (row.spendMinor / max) * 100);
        const overBudget = row.limitMinor !== undefined && row.spendMinor > row.limitMinor;
        return (
          <button
            key={row.categoryId}
            type="button"
            onClick={onSelect ? () => onSelect(row.categoryId) : undefined}
            className="group block w-full text-left"
            disabled={!onSelect}
          >
            <div className="mb-1 flex items-baseline justify-between gap-2 text-sm">
              <span className="flex items-center gap-1.5 font-medium">
                <CategoryIcon icon={row.icon} color={row.color} />
                <span className="group-hover:underline">{row.name}</span>
              </span>
              <span className={`num ${overBudget ? "text-negative" : "text-muted-foreground"}`}>
                {formatMoney(row.spendMinor, currency)}
              </span>
            </div>
            <div className="relative h-2 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full transition-[width]"
                style={{ width: `${widthPct}%`, backgroundColor: chartColor(row.color) }}
              />
              {row.limitMinor !== undefined && row.limitMinor > 0 ? (
                <div
                  className="absolute top-0 h-full w-0.5 bg-foreground/50"
                  style={{ left: `${Math.min(100, (row.limitMinor / max) * 100)}%` }}
                  title={`Budget ${formatMoney(row.limitMinor, currency)}`}
                />
              ) : null}
            </div>
          </button>
        );
      })}
    </div>
  );
});
