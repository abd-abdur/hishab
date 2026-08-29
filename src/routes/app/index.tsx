import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { AlertTriangle, CalendarClock, FileUp, Upload } from "lucide-react";
import { useMemo } from "react";

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
  component: DashboardPage,
});

function monthName(month: string): string {
  const [year, m] = month.split("-");
  return new Date(Number(year), Number(m) - 1, 1).toLocaleDateString("en-AE", { month: "long" });
}

function DashboardPage() {
  const navigate = useNavigate();
  const { data, isPending } = useQuery({
    queryKey: ["dashboard"],
    queryFn: () => getDashboardFn(),
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
    enabled: Boolean(data && data.freshness.transactionCount > 0),
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
  const paceDelta =
    pace.prevSpendSamePointMinor > 0
      ? Math.round(
          ((pace.spendToDateMinor - pace.prevSpendSamePointMinor) / pace.prevSpendSamePointMinor) *
            100,
        )
      : null;
  const overBudgetCount = budgets.filter((b) => b.projectedMinor > b.limitMinor).length;
  const thisMonthIncome = data.monthly.find((m) => m.month === data.month)?.incomeMinor ?? 0;
  const netMinor = thisMonthIncome - pace.spendToDateMinor;
  const budgetByCategory = new Map(budgets.map((b) => [b.categoryId, b.limitMinor]));

  return (
    <>
      <PageHeader
        title="Overview"
        description={
          freshness.latestDate
            ? `Data through ${formatDateLong(freshness.latestDate)} · ${freshness.statementCount} statement${freshness.statementCount === 1 ? "" : "s"}`
            : undefined
        }
        actions={
          <Button asChild variant="outline" size="sm">
            <Link to="/app/statements">
              <Upload className="size-4" />
              Upload
            </Link>
          </Button>
        }
      />
      <div className="grid gap-4 p-4 md:grid-cols-3 md:p-6">
        <StatCard
          label={`${monthName(data.month)} spend`}
          value={formatMoney(pace.spendToDateMinor)}
          detail={
            paceDelta !== null ? (
              <span className={paceDelta > 0 ? "text-negative" : "text-positive"}>
                {paceDelta > 0 ? "+" : ""}
                {paceDelta}% vs {monthName(pace.prevMonth)}
                {data.isCurrentMonth ? " at this point" : ""}
              </span>
            ) : (
              "No previous month to compare yet"
            )
          }
        >
          <SpendSparkline data={pace.dailySeries} />
        </StatCard>
        <StatCard
          label={`Net cashflow in ${monthName(data.month)}`}
          value={`${netMinor < 0 ? "−" : "+"}${formatMoney(Math.abs(netMinor))}`}
          tone={netMinor < 0 ? "negative" : "positive"}
          detail={`Income ${formatMoney(thisMonthIncome)}`}
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
            <CardTitle className="text-base">Where {monthName(data.month)} went</CardTitle>
          </CardHeader>
          <CardContent>
            {byCategory.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No spending recorded in {monthName(data.month)} yet.
              </p>
            ) : (
              <CategoryBars
                data={byCategory.map((c) => ({
                  ...c,
                  limitMinor: budgetByCategory.get(c.categoryId),
                }))}
                onSelect={(categoryId) =>
                  void navigate({ to: "/app/transactions", search: { cat: categoryId } })
                }
              />
            )}
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
