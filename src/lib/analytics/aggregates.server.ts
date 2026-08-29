import { and, desc, eq, gte, lte, sql } from "drizzle-orm";

import { db } from "@/db/client";
import { budgets, categories, statements, transactions } from "@/db/schema";

/**
 * Every number the UI shows is computed here in SQL/TypeScript from stored
 * transactions. Transfers are excluded from spend/income; credits in expense
 * categories net against spend (refunds).
 */

const num = (value: unknown): number => Number(value ?? 0);

export type MonthKey = `${number}-${string}`; // "2026-08"

export function monthRange(month: MonthKey): { from: string; to: string } {
  const [yearStr, monthStr] = month.split("-");
  const year = Number(yearStr);
  const monthNum = Number(monthStr);
  const from = `${yearStr}-${monthStr}-01`;
  const lastDay = new Date(year, monthNum, 0).getDate();
  const to = `${yearStr}-${monthStr}-${String(lastDay).padStart(2, "0")}`;
  return { from, to };
}

export async function getSpendByCategory(userId: string, month: MonthKey, currency: string) {
  const { from, to } = monthRange(month);
  const rows = await db
    .select({
      categoryId: categories.id,
      name: categories.name,
      color: categories.color,
      icon: categories.icon,
      spendMinor: sql<string>`sum(case when ${transactions.direction} = 'debit' then ${transactions.amountMinor} else -${transactions.amountMinor} end)`,
      count: sql<string>`count(*)`,
    })
    .from(transactions)
    .innerJoin(categories, eq(transactions.categoryId, categories.id))
    .where(
      and(
        eq(transactions.userId, userId),
        eq(transactions.currency, currency),
        eq(categories.kind, "expense"),
        gte(transactions.txnDate, from),
        lte(transactions.txnDate, to),
      ),
    )
    .groupBy(categories.id, categories.name, categories.color, categories.icon)
    .orderBy(desc(sql`2`));

  return rows
    .map((r) => ({
      categoryId: r.categoryId,
      name: r.name,
      color: r.color,
      icon: r.icon,
      spendMinor: num(r.spendMinor),
      count: num(r.count),
    }))
    .filter((r) => r.spendMinor !== 0)
    .sort((a, b) => b.spendMinor - a.spendMinor);
}

export type MonthTotals = {
  month: string;
  spendMinor: number;
  incomeMinor: number;
};

export async function getMonthlyTotals(
  userId: string,
  monthsBack: number,
  currency: string,
): Promise<MonthTotals[]> {
  const result = await db.execute(sql`
    SELECT to_char(date_trunc('month', t.txn_date), 'YYYY-MM') AS month,
           sum(CASE WHEN c.kind = 'expense' AND t.direction = 'debit' THEN t.amount_minor
                    WHEN c.kind = 'expense' AND t.direction = 'credit' THEN -t.amount_minor
                    ELSE 0 END) AS spend_minor,
           sum(CASE WHEN c.kind = 'income' AND t.direction = 'credit' THEN t.amount_minor ELSE 0 END) AS income_minor
    FROM transactions t
    JOIN categories c ON c.id = t.category_id
    WHERE t.user_id = ${userId} AND t.currency = ${currency}
      AND t.txn_date >= date_trunc('month', now())::date - (${monthsBack} || ' months')::interval
    GROUP BY 1
    ORDER BY 1
  `);
  return (result.rows as Array<Record<string, unknown>>).map((r) => ({
    month: String(r["month"]),
    spendMinor: num(r["spend_minor"]),
    incomeMinor: num(r["income_minor"]),
  }));
}

/**
 * Daily spend for sparkline / calendar heatmap. Fetches a whole date range in
 * one query; pace comparisons slice it locally instead of re-querying.
 */
export async function getDailySpend(userId: string, from: string, to: string, currency: string) {
  const result = await db.execute(sql`
    SELECT t.txn_date AS day,
           sum(CASE WHEN t.direction = 'debit' THEN t.amount_minor ELSE -t.amount_minor END) AS spend_minor,
           count(*) AS txn_count
    FROM transactions t
    JOIN categories c ON c.id = t.category_id
    WHERE t.user_id = ${userId} AND t.currency = ${currency} AND c.kind = 'expense'
      AND t.txn_date >= ${from} AND t.txn_date <= ${to}
    GROUP BY 1
    ORDER BY 1
  `);
  return (result.rows as Array<Record<string, unknown>>).map((r) => ({
    day: String(r["day"]).slice(0, 10),
    spendMinor: num(r["spend_minor"]),
    count: num(r["txn_count"]),
  }));
}

/**
 * What fraction of the days in [from, to] fall inside at least one uploaded
 * statement's period. A month is only comparable when its statements actually
 * covered it — otherwise "July spend" is an artifact of missing data, not a
 * spending pattern.
 */
export async function getCoverageRatio(userId: string, from: string, to: string): Promise<number> {
  const rows = await db
    .select({ periodStart: statements.periodStart, periodEnd: statements.periodEnd })
    .from(statements)
    .where(eq(statements.userId, userId));

  const start = new Date(`${from}T00:00:00`);
  const end = new Date(`${to}T00:00:00`);
  const totalDays = Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1;
  if (totalDays <= 0) return 0;

  const covered = new Set<number>();
  for (const row of rows) {
    if (!row.periodStart || !row.periodEnd) continue;
    const ps = new Date(`${row.periodStart}T00:00:00`);
    const pe = new Date(`${row.periodEnd}T00:00:00`);
    const first = Math.max(0, Math.round((ps.getTime() - start.getTime()) / 86_400_000));
    const last = Math.min(totalDays - 1, Math.round((pe.getTime() - start.getTime()) / 86_400_000));
    for (let d = first; d <= last; d++) covered.add(d);
  }
  return covered.size / totalDays;
}

/**
 * Spend this month through a given day vs. previous month through the same
 * day — the honest "12% ahead of July at this point" comparison.
 */
export async function getPaceComparison(userId: string, today: Date, currency: string) {
  const dayOfMonth = today.getDate();
  const thisMonth =
    `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}` as MonthKey;
  const prev = new Date(today.getFullYear(), today.getMonth() - 1, 1);
  const prevMonth =
    `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, "0")}` as MonthKey;

  const thisRange = monthRange(thisMonth);
  const prevRange = monthRange(prevMonth);
  const prevLastDay = new Date(prev.getFullYear(), prev.getMonth() + 1, 0).getDate();
  const prevCutDay = Math.min(dayOfMonth, prevLastDay);
  const prevCut = `${prevRange.from.slice(0, 8)}${String(prevCutDay).padStart(2, "0")}`;
  const thisCut = `${thisRange.from.slice(0, 8)}${String(dayOfMonth).padStart(2, "0")}`;

  // one query spanning both months, sliced locally
  const [daily, prevCoverage, thisCoverage] = await Promise.all([
    getDailySpend(userId, prevRange.from, thisRange.to, currency),
    getCoverageRatio(userId, prevRange.from, prevCut),
    getCoverageRatio(userId, thisRange.from, thisCut),
  ]);
  const sum = (from: string, to: string) =>
    daily.reduce((total, r) => (r.day >= from && r.day <= to ? total + r.spendMinor : total), 0);

  return {
    thisMonth,
    prevMonth,
    spendToDateMinor: sum(thisRange.from, thisCut),
    prevSpendSamePointMinor: sum(prevRange.from, prevCut),
    prevMonthTotalMinor: sum(prevRange.from, prevRange.to),
    dailySeries: daily.filter((r) => r.day >= thisRange.from && r.day <= thisCut),
    /** fraction of compared days actually covered by uploaded statements */
    prevCoverage,
    thisCoverage,
  };
}

export type BudgetStatus = {
  budgetId: string;
  categoryId: string;
  categoryName: string;
  color: string;
  icon: string;
  limitMinor: number;
  spentMinor: number;
  /** linear projection to month end from current pace */
  projectedMinor: number;
  currency: string;
};

export async function getBudgetStatuses(userId: string, today: Date): Promise<BudgetStatus[]> {
  const month =
    `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}` as MonthKey;
  const { from, to } = monthRange(month);
  const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
  const dayOfMonth = today.getDate();

  const rows = await db
    .select({
      budgetId: budgets.id,
      categoryId: budgets.categoryId,
      categoryName: categories.name,
      color: categories.color,
      icon: categories.icon,
      limitMinor: budgets.monthlyLimitMinor,
      currency: budgets.currency,
      spentMinor: sql<string>`coalesce((
        select sum(case when t.direction = 'debit' then t.amount_minor else -t.amount_minor end)
        from transactions t
        where t.user_id = ${userId}
          and t.category_id = ${budgets.categoryId}
          and t.currency = ${budgets.currency}
          and t.txn_date >= ${from} and t.txn_date <= ${to}
      ), 0)`,
    })
    .from(budgets)
    .innerJoin(categories, eq(budgets.categoryId, categories.id))
    .where(eq(budgets.userId, userId));

  return rows.map((r) => {
    const spent = num(r.spentMinor);
    return {
      budgetId: r.budgetId,
      categoryId: r.categoryId,
      categoryName: r.categoryName,
      color: r.color,
      icon: r.icon,
      limitMinor: r.limitMinor,
      spentMinor: spent,
      projectedMinor: dayOfMonth > 0 ? Math.round((spent / dayOfMonth) * daysInMonth) : spent,
      currency: r.currency,
    };
  });
}

export async function getTopMerchants(
  userId: string,
  from: string,
  to: string,
  currency: string,
  limit = 12,
) {
  const result = await db.execute(sql`
    SELECT t.merchant_norm, max(t.merchant_display) AS merchant_display,
           max(t.category_id) AS category_id,
           sum(CASE WHEN t.direction = 'debit' THEN t.amount_minor ELSE -t.amount_minor END) AS spend_minor,
           count(*) AS txn_count
    FROM transactions t
    JOIN categories c ON c.id = t.category_id
    WHERE t.user_id = ${userId} AND t.currency = ${currency} AND c.kind = 'expense'
      AND t.txn_date >= ${from} AND t.txn_date <= ${to}
    GROUP BY t.merchant_norm
    HAVING sum(CASE WHEN t.direction = 'debit' THEN t.amount_minor ELSE -t.amount_minor END) > 0
    ORDER BY 4 DESC
    LIMIT ${limit}
  `);
  return (result.rows as Array<Record<string, unknown>>).map((r) => ({
    merchantNorm: String(r["merchant_norm"]),
    merchantDisplay: String(r["merchant_display"]),
    categoryId: String(r["category_id"]),
    spendMinor: num(r["spend_minor"]),
    count: num(r["txn_count"]),
  }));
}

/**
 * Data freshness plus the user's primary currency (their most common
 * transaction currency) — one round trip, used to anchor every page.
 */
export async function getFreshness(userId: string) {
  const result = await db.execute(sql`
    SELECT max(txn_date) AS latest_date,
           min(txn_date) AS earliest_date,
           count(*) AS txn_count,
           mode() WITHIN GROUP (ORDER BY currency) AS primary_currency,
           count(DISTINCT currency) AS currency_count,
           (SELECT count(*) FROM statements s WHERE s.user_id = ${userId}) AS stmt_count
    FROM transactions
    WHERE user_id = ${userId}
  `);
  const row = (result.rows as Array<Record<string, unknown>>)[0];
  return {
    latestDate: row?.["latest_date"] ? String(row["latest_date"]).slice(0, 10) : null,
    earliestDate: row?.["earliest_date"] ? String(row["earliest_date"]).slice(0, 10) : null,
    transactionCount: num(row?.["txn_count"]),
    statementCount: num(row?.["stmt_count"]),
    primaryCurrency: row?.["primary_currency"] ? String(row["primary_currency"]) : "AED",
    currencyCount: num(row?.["currency_count"]),
  };
}
