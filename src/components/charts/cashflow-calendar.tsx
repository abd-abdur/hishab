import { memo } from "react";

import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/utils";

type DayCell = { day: string; spendMinor: number; count: number };

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/**
 * Month grid shaded by daily spend. Plain CSS grid — no chart library needed.
 */
export const CashflowCalendar = memo(function CashflowCalendar({
  month,
  data,
  currency = "AED",
  onSelectDay,
}: {
  month: string; // "2026-08"
  data: DayCell[];
  currency?: string;
  onSelectDay?: (day: string) => void;
}) {
  const [yearStr, monthStr] = month.split("-");
  const year = Number(yearStr);
  const monthIndex = Number(monthStr) - 1;
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
  // Monday-first offset
  const firstWeekday = (new Date(year, monthIndex, 1).getDay() + 6) % 7;

  const byDay = new Map(data.map((d) => [d.day, d]));
  const max = Math.max(...data.map((d) => d.spendMinor), 1);

  const cells: Array<{ day: number; iso: string; cell: DayCell | undefined } | null> = [];
  for (let i = 0; i < firstWeekday; i++) cells.push(null);
  for (let day = 1; day <= daysInMonth; day++) {
    const iso = `${yearStr}-${monthStr}-${String(day).padStart(2, "0")}`;
    cells.push({ day, iso, cell: byDay.get(iso) });
  }

  return (
    <div>
      <div className="grid grid-cols-7 gap-1 text-center text-xs text-muted-foreground">
        {WEEKDAYS.map((d) => (
          <div key={d} className="py-1">
            {d}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {cells.map((entry, i) => {
          if (!entry) return <div key={`pad-${i}`} />;
          const intensity = entry.cell ? Math.max(0.12, entry.cell.spendMinor / max) : 0;
          return (
            <button
              key={entry.iso}
              type="button"
              onClick={onSelectDay && entry.cell ? () => onSelectDay(entry.iso) : undefined}
              disabled={!entry.cell || !onSelectDay}
              title={
                entry.cell
                  ? `${formatMoney(entry.cell.spendMinor, currency)} · ${entry.cell.count} transactions`
                  : undefined
              }
              className={cn(
                "flex aspect-square flex-col items-center justify-center rounded-md border text-xs",
                entry.cell && onSelectDay ? "cursor-pointer hover:ring-2 hover:ring-ring" : "",
                !entry.cell ? "text-muted-foreground/60" : "font-medium",
              )}
              style={
                entry.cell
                  ? {
                      backgroundColor: `color-mix(in oklch, var(--primary) ${Math.round(intensity * 55)}%, var(--card))`,
                    }
                  : undefined
              }
            >
              {entry.day}
            </button>
          );
        })}
      </div>
    </div>
  );
});
