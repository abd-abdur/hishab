import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { ChartColumn } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { CategoryDot } from "@/components/app/category-icon";
import { EmptyState } from "@/components/app/empty-state";
import { Money } from "@/components/app/money";
import { PageHeader } from "@/components/app/page-header";
import { CashflowCalendar } from "@/components/charts/cashflow-calendar";
import { CategoryDonut } from "@/components/charts/category-donut";
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
import { formatDateLong } from "@/lib/money";

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

  const { data, isPending } = useQuery({
    queryKey: ["reports", month],
    queryFn: () => getReportsFn({ data: { month } }),
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
    queryKey: ["day", selectedDay],
    queryFn: () => getDayTransactionsFn({ data: { day: selectedDay as string } }),
    enabled: selectedDay != null,
  });

  const hasData = (data?.monthly ?? []).some((m) => m.spendMinor > 0 || m.incomeMinor > 0);

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
                  <MonthlyTrend data={data?.monthly ?? []} />
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">{monthLabel(month)} by category</CardTitle>
                </CardHeader>
                <CardContent>
                  {(data?.byCategory ?? []).length === 0 ? (
                    <p className="text-sm text-muted-foreground">No spending this month.</p>
                  ) : (
                    <div className="grid items-center gap-4 sm:grid-cols-2">
                      <CategoryDonut data={data?.byCategory ?? []} />
                      <ul className="space-y-1.5 text-sm">
                        {(data?.byCategory ?? []).slice(0, 8).map((c) => (
                          <li key={c.categoryId} className="flex items-center gap-2">
                            <CategoryDot color={c.color} />
                            <span className="min-w-0 flex-1 truncate">{c.name}</span>
                            <Money value={c.spendMinor} className="text-sm text-muted-foreground" />
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="calendar" className="mt-4">
              <Card className="max-w-2xl">
                <CardHeader>
                  <CardTitle className="text-base">Daily spend · {monthLabel(month)}</CardTitle>
                </CardHeader>
                <CardContent>
                  <CashflowCalendar
                    month={month}
                    data={data?.daily ?? []}
                    onSelectDay={setSelectedDay}
                  />
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
                          <Money value={m.spendMinor} className="text-sm" />
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
