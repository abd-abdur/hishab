import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { ChartColumn } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { CategoryDot } from "@/components/app/category-icon";
import { EmptyState } from "@/components/app/empty-state";
import { Money } from "@/components/app/money";
import { PageHeader } from "@/components/app/page-header";
import { CashflowCalendar } from "@/components/charts/cashflow-calendar";
import { CategoryDonut } from "@/components/charts/category-donut";
import { CategoryStackedTrend } from "@/components/charts/category-stacked-trend";
import { MonthlyTrend } from "@/components/charts/monthly-trend";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getDayTransactionsFn, getReportsFn } from "@/lib/app-data.functions";
import { getCountryRefinementCandidatesFn, refineCountriesFn } from "@/lib/country.functions";
import { decryptRows, decryptValue, LOCKED_VALUE } from "@/lib/enc-data";
import { getStoredKeys } from "@/lib/key-store";
import { formatDateLong, formatMoney } from "@/lib/money";

export const Route = createFileRoute("/app/reports")({
  component: ReportsPage,
});

function lastMonths(count: number): string[] {
  const months: string[] = [];
  const now = new Date();
  for (let i = 0; i < count; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }
  return months;
}

function monthLabel(month: string): string {
  if (month === "all") return "All time";
  const [year, m] = month.split("-");
  return new Date(Number(year), Number(m) - 1, 1).toLocaleDateString("en-AE", {
    month: "long",
    year: "numeric",
  });
}

function ReportsPage() {
  const monthOptions = useMemo(() => lastMonths(12), []);
  const [month, setMonth] = useState(monthOptions[0] as string);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [autoAnchored, setAutoAnchored] = useState(false);

  const session = Route.useRouteContext({ select: (ctx) => ctx.session });
  const { data, isPending } = useQuery({
    queryKey: ["reports", month, session.userId],
    queryFn: async () => {
      const result = await getReportsFn({ data: { month } });
      const keys = await getStoredKeys(session.userId);
      return {
        ...result,
        topMerchants: await decryptRows(keys, result.topMerchants, ["merchantDisplay"]),
      };
    },
    staleTime: 60_000,
  });

  // First visit lands on the calendar month; if it's empty, jump once to the
  // latest month that actually has data instead of showing a wall of zeros.
  useEffect(() => {
    if (autoAnchored || !data || month !== monthOptions[0]) return;
    const hasDataThisMonth = data.byCategory.length > 0 || data.daily.length > 0;
    if (!hasDataThisMonth) {
      const latest = [...data.monthly]
        .reverse()
        .find((m) => (m.spendMinor > 0 || m.incomeMinor > 0) && monthOptions.includes(m.month));
      if (latest) setMonth(latest.month);
    }
    setAutoAnchored(true);
  }, [autoAnchored, data, month, monthOptions]);

  const dayQuery = useQuery({
    queryKey: ["day", selectedDay, session.userId],
    queryFn: async () => {
      const rows = await getDayTransactionsFn({ data: { day: selectedDay as string } });
      const keys = await getStoredKeys(session.userId);
      return decryptRows(keys, rows, ["description", "merchantDisplay"]);
    },
    enabled: selectedDay != null,
  });

  const hasData = (data?.monthly ?? []).some((m) => m.spendMinor > 0 || m.incomeMinor > 0);

  // donut: top 8 slices, the tail folded into a muted "Other"
  const donutData = useMemo(() => {
    const cats = data?.byCategory ?? [];
    if (cats.length <= 8) return cats;
    const top = cats.slice(0, 8);
    const otherTotal = cats.slice(8).reduce((sum, c) => sum + c.spendMinor, 0);
    return [
      ...top,
      {
        categoryId: "other",
        name: "Other",
        color: "chart-10",
        icon: "tag",
        spendMinor: otherTotal,
        count: 0,
      },
    ];
  }, [data?.byCategory]);
  const donutTotal = useMemo(
    () => (data?.byCategory ?? []).reduce((sum, c) => sum + c.spendMinor, 0),
    [data?.byCategory],
  );

  // One-shot: rows ingested before merchant-country hints existed sit on the
  // home-country default. Decrypt their merchant names here (only the browser
  // can) and let the model refine — once per browser.
  const queryClient = useQueryClient();
  const refineStarted = useRef(false);
  useEffect(() => {
    if (refineStarted.current) return;
    refineStarted.current = true;
    void (async () => {
      try {
        if (localStorage.getItem("hishab-countries-refined")) return;
        const keys = await getStoredKeys(session.userId);
        if (!keys) return;
        const candidates = await getCountryRefinementCandidatesFn();
        if (candidates.length < 3) return;
        const merchants = (
          await Promise.all(
            candidates.map(async (c) => ({
              token: c.token,
              name: await decryptValue(keys, c.displayEnc),
            })),
          )
        ).filter((m) => m.name !== LOCKED_VALUE);
        if (merchants.length === 0) return;
        const { updated } = await refineCountriesFn({ data: { merchants } });
        localStorage.setItem("hishab-countries-refined", "1");
        if (updated > 0) void queryClient.invalidateQueries({ queryKey: ["reports"] });
      } catch {
        // best-effort; next Reports visit retries
        refineStarted.current = false;
      }
    })();
  }, [session.userId, queryClient]);

  // spend by merchant country: stable color per country code, never by rank
  const countrySlices = useMemo(() => {
    const rows = data?.byCountry ?? [];
    const displayNames = new Intl.DisplayNames(["en"], { type: "region" });
    return rows.map((row) => ({
      categoryId: row.country ?? "unknown",
      name: row.country ? (displayNames.of(row.country) ?? row.country) : "Unknown",
      color: row.country ? countryColorSlot(row.country) : "chart-10",
      spendMinor: row.spendMinor,
      count: row.count,
    }));
  }, [data?.byCountry]);
  const countryTotal = useMemo(
    () => countrySlices.reduce((sum, c) => sum + c.spendMinor, 0),
    [countrySlices],
  );

  // biggest movers: latest trend month vs the one before it
  const movers = useMemo(() => {
    const trend = data?.categoryTrend ?? [];
    const months = [...new Set(trend.map((t) => t.month))].sort();
    if (months.length < 2) return [];
    const [prevMonth, currMonth] = [months[months.length - 2], months[months.length - 1]];
    const byCat = new Map<string, { name: string; color: string; prev: number; curr: number }>();
    for (const t of trend) {
      if (t.month !== prevMonth && t.month !== currMonth) continue;
      const entry = byCat.get(t.categoryId) ?? { name: t.name, color: t.color, prev: 0, curr: 0 };
      if (t.month === prevMonth) entry.prev = Math.max(0, t.spendMinor);
      else entry.curr = Math.max(0, t.spendMinor);
      byCat.set(t.categoryId, entry);
    }
    return [...byCat.values()]
      .filter((e) => e.prev > 0 || e.curr > 0)
      .map((e) => ({ ...e, delta: e.curr - e.prev }))
      .filter((e) => e.delta !== 0)
      .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
      .slice(0, 6);
  }, [data?.categoryTrend]);

  return (
    <>
      <PageHeader
        title="Reports"
        actions={
          <Select value={month} onValueChange={setMonth}>
            <SelectTrigger className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All time</SelectItem>
              {monthOptions.map((m) => (
                <SelectItem key={m} value={m}>
                  {monthLabel(m)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        }
      />
      <div className="p-4 md:p-6">
        {isPending ? (
          <Skeleton className="h-96" />
        ) : !hasData ? (
          <EmptyState
            icon={ChartColumn}
            title="Nothing to report yet"
            description="Reports build up as you add statements — trends, a spending calendar and merchant totals."
          />
        ) : (
          <Tabs defaultValue="trends">
            <TabsList>
              <TabsTrigger value="trends">Trends</TabsTrigger>
              <TabsTrigger value="calendar">Calendar</TabsTrigger>
              <TabsTrigger value="merchants">Merchants</TabsTrigger>
            </TabsList>

            <TabsContent value="trends" className="mt-4 grid gap-4 lg:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Income vs spend</CardTitle>
                </CardHeader>
                <CardContent>
                  <MonthlyTrend data={data?.monthly ?? []} currency={data?.currency ?? "AED"} />
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">
                    {month === "all" ? "All time by category" : `${monthLabel(month)} by category`}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {donutData.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No spending this month.</p>
                  ) : (
                    <div className="grid items-center gap-4 sm:grid-cols-2">
                      <CategoryDonut
                        data={donutData}
                        currency={data?.currency ?? "AED"}
                        centerLabel={{ title: "total", value: donutTotal }}
                      />
                      <ul className="space-y-1.5 text-sm">
                        {donutData.map((c) => (
                          <li key={c.categoryId} className="flex items-center gap-2">
                            <CategoryDot color={c.color} />
                            <span className="min-w-0 flex-1 truncate">{c.name}</span>
                            <span className="num w-10 text-right text-xs text-muted-foreground">
                              {donutTotal > 0 ? Math.round((c.spendMinor / donutTotal) * 100) : 0}%
                            </span>
                            <Money
                              value={c.spendMinor}
                              currency={data?.currency ?? "AED"}
                              className="text-sm text-muted-foreground"
                            />
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">
                    {month === "all" ? "All time by country" : `${monthLabel(month)} by country`}
                  </CardTitle>
                  <p className="text-xs text-muted-foreground">
                    Where the money was spent, judged from each row's merchant text
                  </p>
                </CardHeader>
                <CardContent>
                  {countrySlices.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No spending this month.</p>
                  ) : countrySlices.length === 1 ? (
                    <p className="text-sm">
                      All spending this period —{" "}
                      <Money value={countryTotal} currency={data?.currency ?? "AED"} /> across{" "}
                      {countrySlices[0]!.count} transactions — was in{" "}
                      <span className="font-medium">{countrySlices[0]!.name}</span>.
                    </p>
                  ) : (
                    <div className="grid items-center gap-4 sm:grid-cols-2">
                      <CategoryDonut
                        data={countrySlices}
                        currency={data?.currency ?? "AED"}
                        centerLabel={{ title: "total", value: countryTotal }}
                      />
                      <ul className="space-y-1.5 text-sm">
                        {countrySlices.map((c) => (
                          <li key={c.categoryId} className="flex items-center gap-2">
                            <CategoryDot color={c.color} />
                            <span className="min-w-0 flex-1 truncate">{c.name}</span>
                            <span className="num w-10 text-right text-xs text-muted-foreground">
                              {countryTotal > 0 ? Math.round((c.spendMinor / countryTotal) * 100) : 0}%
                            </span>
                            <Money
                              value={c.spendMinor}
                              currency={data?.currency ?? "AED"}
                              className="text-sm text-muted-foreground"
                            />
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card className="lg:col-span-2">
                <CardHeader>
                  <CardTitle className="text-base">Categories, month by month</CardTitle>
                  <p className="text-xs text-muted-foreground">
                    Top categories stacked per month — the shape of where the money goes
                  </p>
                </CardHeader>
                <CardContent>
                  {(data?.categoryTrend ?? []).length === 0 ? (
                    <p className="text-sm text-muted-foreground">Not enough history yet.</p>
                  ) : (
                    <CategoryStackedTrend
                      data={data?.categoryTrend ?? []}
                      currency={data?.currency ?? "AED"}
                    />
                  )}
                </CardContent>
              </Card>

              {movers.length > 0 ? (
                <Card className="lg:col-span-2">
                  <CardHeader>
                    <CardTitle className="text-base">Biggest changes vs last month</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ul className="grid gap-x-8 gap-y-2 sm:grid-cols-2">
                      {movers.map((m) => (
                        <li key={m.name} className="flex items-center gap-2 text-sm">
                          <CategoryDot color={m.color} />
                          <span className="min-w-0 flex-1 truncate">{m.name}</span>
                          <Money
                            value={m.curr}
                            currency={data?.currency ?? "AED"}
                            className="text-sm text-muted-foreground"
                          />
                          <span
                            className={`num w-24 text-right text-xs ${
                              m.delta > 0 ? "text-negative" : "text-positive"
                            }`}
                          >
                            {m.prev === 0
                              ? "new"
                              : `${m.delta > 0 ? "+" : "−"}${formatMoney(Math.abs(m.delta), data?.currency ?? "AED")}`}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              ) : null}
            </TabsContent>

            <TabsContent value="calendar" className="mt-4">
              <Card className="max-w-2xl">
                <CardHeader>
                  <CardTitle className="text-base">Daily spend · {monthLabel(month)}</CardTitle>
                </CardHeader>
                <CardContent>
                  {month === "all" ? (
                    <p className="text-sm text-muted-foreground">
                      The daily calendar is a one-month view — pick a specific month above to see
                      it.
                    </p>
                  ) : (
                    <CashflowCalendar
                      month={month}
                      data={data?.daily ?? []}
                      currency={data?.currency ?? "AED"}
                      onSelectDay={setSelectedDay}
                    />
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="merchants" className="mt-4">
              <Card className="max-w-2xl">
                <CardHeader>
                  <CardTitle className="text-base">Top merchants · {monthLabel(month)}</CardTitle>
                </CardHeader>
                <CardContent>
                  {(data?.topMerchants ?? []).length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      No merchant spending this month.
                    </p>
                  ) : (
                    <div className="divide-y">
                      {(data?.topMerchants ?? []).map((m, index) => (
                        <div key={m.merchantNorm} className="flex items-center gap-3 py-2 text-sm">
                          <span className="num w-5 text-xs text-muted-foreground">{index + 1}</span>
                          <span className="min-w-0 flex-1 truncate font-medium">
                            {m.merchantDisplay}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {m.count} transaction{m.count === 1 ? "" : "s"}
                          </span>
                          <Money
                            value={m.spendMinor}
                            currency={data?.currency ?? "AED"}
                            className="text-sm"
                          />
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        )}
      </div>

      <Dialog open={selectedDay != null} onOpenChange={(open) => !open && setSelectedDay(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{selectedDay ? formatDateLong(selectedDay) : ""}</DialogTitle>
          </DialogHeader>
          <div className="divide-y">
            {(dayQuery.data ?? []).map((txn) => (
              <div key={txn.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                <span className="min-w-0 flex-1 truncate">{txn.merchantDisplay}</span>
                <Money
                  value={txn.amountMinor}
                  currency={txn.currency}
                  direction={txn.direction}
                  className="text-sm"
                />
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

/** Deterministic chart slot per country code — color follows the country, never its rank. */
const COUNTRY_SLOTS = ["chart-2", "chart-5", "chart-7", "chart-9", "chart-11", "chart-4", "chart-8", "chart-12"];
function countryColorSlot(code: string): string {
  let hash = 0;
  for (const ch of code) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return COUNTRY_SLOTS[hash % COUNTRY_SLOTS.length] as string;
}
