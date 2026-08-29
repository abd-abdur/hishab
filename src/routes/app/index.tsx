import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { AlertTriangle, CalendarClock, FileUp, Upload } from "lucide-react";
import { useMemo } from "react";
import { z } from "zod";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { CategoryDot } from "@/components/app/category-icon";
import { EmptyState } from "@/components/app/empty-state";
import { Money } from "@/components/app/money";
import { PageHeader } from "@/components/app/page-header";
import { StatCard } from "@/components/app/stat-card";
import { CategoryBars } from "@/components/charts/category-bars";
import { SpendSparkline } from "@/components/charts/spend-sparkline";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { getCategoriesFn, getDashboardFn, getInsightsFn } from "@/lib/app-data.functions";
import { formatDate, formatDateLong, formatMoney } from "@/lib/money";

export const Route = createFileRoute("/app/")({
  validateSearch: z.object({
    m: z.union([z.literal("all"), z.string().regex(/^\d{4}-\d{2}$/)]).optional(),
  }),
  component: DashboardPage,
});

function monthName(month: string): string {
  if (month === "all") return "all time";
  const [year, m] = month.split("-");
  return new Date(Number(year), Number(m) - 1, 1).toLocaleDateString("en-AE", { month: "long" });
}

function monthLabel(month: string): string {
  const [year, m] = month.split("-");
  return new Date(Number(year), Number(m) - 1, 1).toLocaleDateString("en-AE", {
    month: "long",
    year: "numeric",
  });
}

/** Every month from the user's earliest data through today, newest first. */
function monthOptions(earliest: string | null): string[] {
  const months: string[] = [];
  const now = new Date();
  const start = earliest ? new Date(`${earliest.slice(0, 7)}-01T00:00:00`) : now;
  const cursor = new Date(now.getFullYear(), now.getMonth(), 1);
  while (cursor >= start && months.length < 36) {
    months.push(`${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}`);
    cursor.setMonth(cursor.getMonth() - 1);
  }
  return months;
}

function DashboardPage() {
  const navigate = useNavigate({ from: Route.fullPath });
  const { m } = Route.useSearch();
  const { data, isPending } = useQuery({
    queryKey: ["dashboard", m ?? "auto"],
    queryFn: () => getDashboardFn({ data: m ? { month: m } : {} }),
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
  // model-written observations load separately so the numbers never wait
  const { data: insightsData } = useQuery({
    queryKey: ["insights", data?.month],
    queryFn: () => getInsightsFn({ data: { month: data?.month as string } }),
    enabled: Boolean(data && data.freshness.transactionCount > 0 && data.month !== "all"),
    staleTime: 300_000,
  });
  const insights = insightsData?.insights ?? [];

  if (isPending || !data) {
    return (
      <>
        <PageHeader title="Overview" />
        <div className="grid gap-4 p-4 md:grid-cols-3 md:p-6">
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
          <Skeleton className="h-72 md:col-span-2" />
          <Skeleton className="h-72" />
        </div>
      </>
    );
  }

  if (data.freshness.transactionCount === 0) {
    return (
      <>
        <PageHeader title="Overview" />
        <div className="p-4 md:p-6">
          <EmptyState
            icon={FileUp}
            title="Add your first statement"
            description="Upload bank statements — PDF, photos of pages, CSV or Excel — and they become searchable transactions, budgets and trends."
          >
            <Button asChild>
              <Link to="/app/statements">
                <Upload className="size-4" />
                Upload statements
              </Link>
            </Button>
          </EmptyState>
        </div>
      </>
    );
  }

  const { pace, budgets, byCategory, freshness } = data;

  // A percentage is only honest when the previous month's statements actually
  // covered the compared window and the base isn't trivially small.
  const COMPARABLE_COVERAGE = 0.85;
  const MIN_COMPARE_BASE = 5000; // AED 50 in fils
  const prevComparable =
    pace.prevCoverage >= COMPARABLE_COVERAGE && pace.prevSpendSamePointMinor >= MIN_COMPARE_BASE;
  const paceDelta = prevComparable
    ? Math.round(
        ((pace.spendToDateMinor - pace.prevSpendSamePointMinor) / pace.prevSpendSamePointMinor) *
          100,
      )
    : null;
  const spendDetail = data.allTime ? (
    <span>
      {freshness.earliestDate ? formatDateLong(freshness.earliestDate) : ""} –{" "}
      {freshness.latestDate ? formatDateLong(freshness.latestDate) : ""}
    </span>
  ) : pace.spendToDateMinor === 0 && pace.thisCoverage < 0.05 ? (
    <span>No statements cover {monthName(data.month)} yet</span>
  ) : prevComparable ? (
    <span className={(paceDelta ?? 0) > 0 ? "text-negative" : "text-positive"}>
      {(paceDelta ?? 0) > 0 ? "+" : ""}
      {paceDelta}% vs {monthName(pace.prevMonth)}
      {data.isCurrentMonth ? " at this point" : ""}
    </span>
  ) : pace.prevSpendSamePointMinor > 0 ? (
    <span>
      {monthName(pace.prevMonth)} data is partial ({Math.round(pace.prevCoverage * 100)}% of days
      covered) — no fair comparison
    </span>
  ) : (
    "No previous month to compare yet"
  );
  const overBudgetCount = budgets.filter((b) => b.projectedMinor > b.limitMinor).length;
  const thisMonthIncome = data.incomeMinor;
  const netMinor = thisMonthIncome - pace.spendToDateMinor;
  const budgetByCategory = new Map(budgets.map((b) => [b.categoryId, b.limitMinor]));

  return (
    <>
      <PageHeader
        title="Overview"
        description={
          freshness.latestDate
            ? `Data through ${formatDateLong(freshness.latestDate)} · ${freshness.statementCount} statement${freshness.statementCount === 1 ? "" : "s"}${freshness.currencyCount > 1 ? ` · showing ${data.currency}` : ""}`
            : undefined
        }
        actions={
          <>
            <Select
              value={data.month}
              onValueChange={(value) => void navigate({ search: { m: value } })}
            >
              <SelectTrigger className="w-40" aria-label="Month">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All time</SelectItem>
                {monthOptions(freshness.earliestDate).map((option) => (
                  <SelectItem key={option} value={option}>
                    {monthLabel(option)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button asChild variant="outline" size="sm">
              <Link to="/app/statements">
                <Upload className="size-4" />
                Upload
              </Link>
            </Button>
          </>
        }
      />
      <div className="grid gap-4 p-4 md:grid-cols-3 md:p-6">
        <StatCard
          label={data.allTime ? "All-time spend" : `${monthName(data.month)} spend`}
          value={formatMoney(pace.spendToDateMinor, data.currency)}
          detail={spendDetail}
        >
          <SpendSparkline data={pace.dailySeries} />
        </StatCard>
        <StatCard
          label={
            data.allTime ? "Net cashflow, all time" : `Net cashflow in ${monthName(data.month)}`
          }
          value={`${netMinor < 0 ? "−" : "+"}${formatMoney(Math.abs(netMinor), data.currency)}`}
          tone={netMinor < 0 ? "negative" : "positive"}
          detail={`Income ${formatMoney(thisMonthIncome, data.currency)}`}
        />
        <StatCard
          label={data.isCurrentMonth ? "Budget pace" : "Budgets"}
          value={
            budgets.length === 0
              ? "—"
              : overBudgetCount === 0
                ? `On track: ${budgets.length} of ${budgets.length}`
                : `${overBudgetCount} ${data.isCurrentMonth ? "pacing over" : "went over"}`
          }
          tone={overBudgetCount > 0 ? "warning" : undefined}
          detail={
            budgets.length === 0 ? (
              <Link to="/app/budgets" className="text-primary hover:underline">
                Set your first budget
              </Link>
            ) : (
              <Link to="/app/budgets" className="text-primary hover:underline">
                Review budgets
              </Link>
            )
          }
        />

        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">
              {data.allTime ? "Where it all went" : `Where ${monthName(data.month)} went`}
            </CardTitle>
            <p className="text-xs text-muted-foreground">Spending net of refunds</p>
          </CardHeader>
          <CardContent>
            {byCategory.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No spending recorded in {monthName(data.month)} yet.
              </p>
            ) : (
              <CategoryBars
                currency={data.currency}
                data={byCategory.map((c) => ({
                  ...c,
                  limitMinor: budgetByCategory.get(c.categoryId),
                }))}
                onSelect={(categoryId) =>
                  void navigate({ to: "/app/transactions", search: { cat: categoryId } })
                }
              />
            )}
            {data.transfers.outMinor > 0 || data.transfers.inMinor > 0 ? (
              <p className="mt-4 border-t pt-3 text-xs text-muted-foreground">
                Transfers between your accounts (not counted as spending):{" "}
                <span className="num">−{formatMoney(data.transfers.outMinor, data.currency)}</span>{" "}
                out ·{" "}
                <span className="num">+{formatMoney(data.transfers.inMinor, data.currency)}</span>{" "}
                in ·{" "}
                <Link
                  to="/app/transactions"
                  search={{ cat: "sys_transfers" }}
                  className="font-medium text-primary hover:underline"
                >
                  view
                </Link>
              </p>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <CalendarClock className="size-4 text-muted-foreground" />
              Recurring next up
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {data.upcoming.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No recurring charges detected yet. They appear after a few months of history.
              </p>
            ) : (
              data.upcoming.map((series) => (
                <div key={series.id} className="flex items-center justify-between gap-2 text-sm">
                  <div className="min-w-0">
                    <div className="truncate font-medium">{series.merchantDisplay}</div>
                    <div className="text-xs text-muted-foreground">
                      {series.nextExpected
                        ? `Expected ${formatDate(series.nextExpected)}`
                        : series.cadence}
                      {series.previousAmountMinor != null ? (
                        <Badge variant="outline" className="ml-1.5 text-warning">
                          price change
                        </Badge>
                      ) : null}
                    </div>
                  </div>
                  <Money
                    value={series.lastAmountMinor}
                    currency={series.currency}
                    className="text-sm"
                  />
                </div>
              ))
            )}
            <Link
              to="/app/recurring"
              className="block pt-1 text-sm font-medium text-primary hover:underline"
            >
              All recurring charges
            </Link>
          </CardContent>
        </Card>

        {insights.length > 0 ? (
          <Card className="md:col-span-3">
            <CardHeader>
              <CardTitle className="text-base">What the numbers say</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="grid gap-2 text-sm md:grid-cols-2">
                {insights.map((insight) => (
                  <li key={insight} className="flex gap-2">
                    <span className="mt-2 size-1 shrink-0 rounded-full bg-primary" />
                    {insight}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        ) : null}

        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Recent activity</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="divide-y">
              {data.recent.map((txn) => {
                const category = categoryById.get(txn.categoryId);
                return (
                  <div key={txn.id} className="flex items-center gap-3 py-2 text-sm">
                    <span className="num w-20 shrink-0 text-xs text-muted-foreground">
                      {formatDate(txn.txnDate)}
                    </span>
                    {category ? <CategoryDot color={category.color} /> : null}
                    <span className="min-w-0 flex-1 truncate">{txn.merchantDisplay}</span>
                    <Money
                      value={txn.amountMinor}
                      currency={txn.currency}
                      direction={txn.direction}
                      neutral={category?.kind === "transfer"}
                      className="text-sm"
                    />
                  </div>
                );
              })}
            </div>
            <Link
              to="/app/transactions"
              className="mt-3 block text-sm font-medium text-primary hover:underline"
            >
              All transactions
            </Link>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <AlertTriangle className="size-4 text-warning" />
              Worth a look
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {data.anomalies.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nothing unusual this month.</p>
            ) : (
              data.anomalies.map((txn) => {
                const category = categoryById.get(txn.categoryId);
                return (
                  <div key={txn.id} className="flex items-center justify-between gap-2 text-sm">
                    <div className="min-w-0">
                      <div className="truncate font-medium">{txn.merchantDisplay}</div>
                      <div className="text-xs text-muted-foreground">
                        {formatDate(txn.txnDate)}
                        {category ? ` · ${category.name}` : ""} · well above your usual
                      </div>
                    </div>
                    <Money value={txn.amountMinor} currency={txn.currency} className="text-sm" />
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
