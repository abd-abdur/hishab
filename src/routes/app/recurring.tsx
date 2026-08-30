import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { CalendarClock, ChevronDown, ChevronRight, EyeOff, TrendingUp } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { CategoryDot } from "@/components/app/category-icon";
import { EmptyState } from "@/components/app/empty-state";
import { Money } from "@/components/app/money";
import { PageHeader } from "@/components/app/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { getCategoriesFn, getRecurringFn } from "@/lib/app-data.functions";
import { setRecurringDismissedFn } from "@/lib/app-mutations.functions";
import { decryptRows } from "@/lib/enc-data";
import { getStoredKeys } from "@/lib/key-store";
import { formatDate, formatMoney } from "@/lib/money";

export const Route = createFileRoute("/app/recurring")({
  component: RecurringPage,
});

const MONTHLY_FACTOR = { weekly: 4.35, monthly: 1, yearly: 1 / 12 } as const;
const ANNUAL_FACTOR = { weekly: 52, monthly: 12, yearly: 1 } as const;

function RecurringPage() {
  const session = Route.useRouteContext({ select: (ctx) => ctx.session });
  const queryClient = useQueryClient();
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const { data: series, isPending } = useQuery({
    queryKey: ["recurring", session.userId],
    queryFn: async () => {
      const rows = await getRecurringFn();
      const keys = await getStoredKeys(session.userId);
      return decryptRows(keys, rows, ["merchantDisplay"]);
    },
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

  const dismiss = useMutation({
    mutationFn: (input: { merchantNorm: string; dismissed: boolean; label: string }) =>
      setRecurringDismissedFn({
        data: { merchantNorm: input.merchantNorm, dismissed: input.dismissed },
      }),
    onSuccess: (_res, input) => {
      void queryClient.invalidateQueries({ queryKey: ["recurring"] });
      void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      if (input.dismissed) {
        toast.success(`${input.label} won't be treated as recurring`, {
          action: {
            label: "Undo",
            onClick: () =>
              dismiss.mutate({
                merchantNorm: input.merchantNorm,
                dismissed: false,
                label: input.label,
              }),
          },
        });
      }
    },
    onError: () => toast.error("Update failed. Try again."),
  });

  const active = (series ?? []).filter((s) => !s.dismissed);
  const dismissedRows = (series ?? []).filter((s) => s.dismissed);

  // committed = current price, not historical average: what next month costs
  const committedMonthly = useMemo(
    () =>
      active.reduce((sum, s) => sum + Math.round(s.lastAmountMinor * MONTHLY_FACTOR[s.cadence]), 0),
    [active],
  );
  const priceChanges = active.filter((s) => s.previousAmountMinor != null);

  function toggleExpanded(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

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
                    {formatMoney(committedMonthly, active[0]?.currency ?? "AED")}
                  </div>
                  <div className="mt-1 text-sm text-muted-foreground">
                    {active.length} recurring charge{active.length === 1 ? "" : "s"} at current
                    prices
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
                    <th className="px-4 py-2 text-right font-medium">Per year</th>
                    <th className="px-4 py-2" />
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {active.map((s) => {
                    const category = categoryById.get(s.categoryId);
                    const hasHistory = (s.priceSteps?.length ?? 0) > 1;
                    const isOpen = expanded.has(s.id);
                    return (
                      <>
                        <tr key={s.id}>
                          <td className="px-4 py-2.5 font-medium">
                            <span className="flex items-center gap-1">
                              {hasHistory ? (
                                <button
                                  type="button"
                                  aria-label={isOpen ? "Hide price history" : "Show price history"}
                                  aria-expanded={isOpen}
                                  className="-ml-1 rounded p-0.5 text-muted-foreground hover:text-foreground"
                                  onClick={() => toggleExpanded(s.id)}
                                >
                                  {isOpen ? (
                                    <ChevronDown className="size-3.5" />
                                  ) : (
                                    <ChevronRight className="size-3.5" />
                                  )}
                                </button>
                              ) : null}
                              {s.merchantDisplay}
                              {s.previousAmountMinor != null ? (
                                <Badge variant="outline" className="ml-1 text-[11px] text-warning">
                                  price change
                                </Badge>
                              ) : null}
                            </span>
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
                          <td className="num px-4 py-2.5 text-right text-muted-foreground">
                            {formatMoney(
                              Math.round(s.lastAmountMinor * ANNUAL_FACTOR[s.cadence]),
                              s.currency,
                            )}
                          </td>
                          <td className="px-4 py-2.5 text-right">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-muted-foreground"
                              disabled={dismiss.isPending}
                              onClick={() =>
                                dismiss.mutate({
                                  merchantNorm: s.merchantNorm,
                                  dismissed: true,
                                  label: s.merchantDisplay,
                                })
                              }
                            >
                              <EyeOff className="size-3.5" />
                              Not a subscription
                            </Button>
                          </td>
                        </tr>
                        {hasHistory && isOpen ? (
                          <tr key={`${s.id}-history`} className="bg-muted/40">
                            <td colSpan={7} className="px-4 py-2">
                              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 pl-4 text-xs text-muted-foreground">
                                {(s.priceSteps ?? []).map((step, i, steps) => {
                                  const prev = i > 0 ? steps[i - 1] : null;
                                  const up = prev != null && step.amountMinor > prev.amountMinor;
                                  return (
                                    <span key={step.date} className="flex items-center gap-1">
                                      {i > 0 ? (
                                        <span className={up ? "text-warning" : "text-positive"}>
                                          →
                                        </span>
                                      ) : null}
                                      <span className="num">
                                        {formatMoney(step.amountMinor, s.currency)}
                                      </span>
                                      <span>from {formatDate(step.date)}</span>
                                    </span>
                                  );
                                })}
                              </div>
                            </td>
                          </tr>
                        ) : null}
                      </>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {dismissedRows.length > 0 ? (
              <div className="rounded-lg border bg-card p-4">
                <div className="text-sm font-medium text-muted-foreground">
                  Dismissed ({dismissedRows.length})
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  These merchants are never treated as subscriptions, even when their charges look
                  recurring.
                </p>
                <ul className="mt-2 divide-y">
                  {dismissedRows.map((s) => (
                    <li
                      key={s.id}
                      className="flex items-center justify-between gap-2 py-1.5 text-sm"
                    >
                      <span className="min-w-0 truncate text-muted-foreground">
                        {s.merchantDisplay}
                      </span>
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={dismiss.isPending}
                        onClick={() =>
                          dismiss.mutate({
                            merchantNorm: s.merchantNorm,
                            dismissed: false,
                            label: s.merchantDisplay,
                          })
                        }
                      >
                        Restore
                      </Button>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </>
        )}
      </div>
    </>
  );
}
