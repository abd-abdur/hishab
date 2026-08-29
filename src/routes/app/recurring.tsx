import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { CalendarClock, TrendingUp } from "lucide-react";
import { useMemo } from "react";

import { CategoryDot } from "@/components/app/category-icon";
import { EmptyState } from "@/components/app/empty-state";
import { Money } from "@/components/app/money";
import { PageHeader } from "@/components/app/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { getCategoriesFn, getRecurringFn } from "@/lib/app-data.functions";
import { formatDate, formatMoney } from "@/lib/money";

export const Route = createFileRoute("/app/recurring")({
  component: RecurringPage,
});

const MONTHLY_FACTOR = { weekly: 4.35, monthly: 1, yearly: 1 / 12 } as const;

function RecurringPage() {
  const { data: series, isPending } = useQuery({
    queryKey: ["recurring"],
    queryFn: () => getRecurringFn(),
    staleTime: 60_000,
  });
  const { data: categories } = useQuery({
    queryKey: ["categories"],
    queryFn: () => getCategoriesFn(),
    staleTime: 300_000,
  });
  const categoryById = useMemo(
    () => new Map((categories ?? []).map((c) => [c.id, c])),
    [categories],
  );

  const committedMonthly = useMemo(
    () =>
      (series ?? []).reduce(
        (sum, s) => sum + Math.round(s.avgAmountMinor * MONTHLY_FACTOR[s.cadence]),
        0,
      ),
    [series],
  );
  const priceChanges = (series ?? []).filter((s) => s.previousAmountMinor != null);

  return (
    <>
      <PageHeader
        title="Recurring"
        description="Subscriptions and standing charges detected from your history."
      />
      <div className="space-y-4 p-4 md:p-6">
        {isPending ? (
          <Skeleton className="h-64" />
        ) : (series ?? []).length === 0 ? (
          <EmptyState
            icon={CalendarClock}
            title="No recurring charges detected yet"
            description="Detection needs at least three occurrences of a charge, so it improves as you add more months of statements."
          />
        ) : (
          <>
            <div className="grid gap-4 sm:grid-cols-2">
              <Card>
                <CardContent className="pt-5">
                  <div className="text-sm text-muted-foreground">Committed spend per month</div>
                  <div className="num mt-1 text-2xl font-semibold">
                    {formatMoney(committedMonthly, series?.[0]?.currency ?? "AED")}
                  </div>
                  <div className="mt-1 text-sm text-muted-foreground">
                    {(series ?? []).length} recurring charge{(series ?? []).length === 1 ? "" : "s"}
                  </div>
                </CardContent>
              </Card>
              {priceChanges.length > 0 ? (
                <Card>
                  <CardContent className="pt-5">
                    <div className="flex items-center gap-1.5 text-sm text-warning">
                      <TrendingUp className="size-4" />
                      Price changes
                    </div>
                    <ul className="mt-2 space-y-1 text-sm">
                      {priceChanges.slice(0, 3).map((s) => (
                        <li key={s.id}>
                          <span className="font-medium">{s.merchantDisplay}</span> went from{" "}
                          <span className="num">
                            {formatMoney(s.previousAmountMinor ?? 0, s.currency)}
                          </span>{" "}
                          to{" "}
                          <span className="num">{formatMoney(s.lastAmountMinor, s.currency)}</span>
                          {s.priceChangedAt ? ` on ${formatDate(s.priceChangedAt)}` : ""}
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              ) : null}
            </div>

            <div className="overflow-x-auto rounded-lg border bg-card">
              <table className="w-full text-sm">
                <thead className="border-b bg-muted text-left text-xs text-muted-foreground">
                  <tr>
                    <th className="px-4 py-2 font-medium">Merchant</th>
                    <th className="px-4 py-2 font-medium">Category</th>
                    <th className="px-4 py-2 font-medium">Cadence</th>
                    <th className="px-4 py-2 font-medium">Next expected</th>
                    <th className="px-4 py-2 text-right font-medium">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {(series ?? []).map((s) => {
                    const category = categoryById.get(s.categoryId);
                    return (
                      <tr key={s.id}>
                        <td className="px-4 py-2.5 font-medium">
                          {s.merchantDisplay}
                          {s.previousAmountMinor != null ? (
                            <Badge variant="outline" className="ml-2 text-[10px] text-warning">
                              price change
                            </Badge>
                          ) : null}
                        </td>
                        <td className="px-4 py-2.5">
                          {category ? (
                            <span className="flex items-center gap-1.5 text-muted-foreground">
                              <CategoryDot color={category.color} />
                              {category.name}
                            </span>
                          ) : null}
                        </td>
                        <td className="px-4 py-2.5 capitalize text-muted-foreground">
                          {s.cadence}
                        </td>
                        <td className="num px-4 py-2.5 text-muted-foreground">
                          {s.nextExpected ? formatDate(s.nextExpected) : "—"}
                        </td>
                        <td className="px-4 py-2.5 text-right">
                          <Money
                            value={s.lastAmountMinor}
                            currency={s.currency}
                            className="text-sm"
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </>
  );
}
