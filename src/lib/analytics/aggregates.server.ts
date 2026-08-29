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

export async function getSpendByCategory(userId: string, month: MonthKey) {
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

export async function getMonthlyTotals(userId: string, monthsBack: number): Promise<MonthTotals[]> {
  const result = await db.execute(sql`
    SELECT to_char(date_trunc('month', t.txn_date), 'YYYY-MM') AS month,
           sum(CASE WHEN c.kind = 'expense' AND t.direction = 'debit' THEN t.amount_minor
                    WHEN c.kind = 'expense' AND t.direction = 'credit' THEN -t.amount_minor
                    ELSE 0 END) AS spend_minor,
           sum(CASE WHEN c.kind = 'income' AND t.direction = 'credit' THEN t.amount_minor ELSE 0 END) AS income_minor
    FROM transactions t
    JOIN categories c ON c.id = t.category_id
    WHERE t.user_id = ${userId}
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

/** Daily spend for sparkline / calendar heatmap. */
export async function getDailySpend(userId: string, from: string, to: string) {
  const result = await db.execute(sql`
    SELECT t.txn_date AS day,
           sum(CASE WHEN t.direction = 'debit' THEN t.amount_minor ELSE -t.amount_minor END) AS spend_minor,
           count(*) AS txn_count
    FROM transactions t
    JOIN categories c ON c.id = t.category_id
    WHERE t.user_id = ${userId} AND c.kind = 'expense'
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
 * Spend this month through a given day vs. previous month through the same
 * day — the honest "12% ahead of July at this point" comparison.
 */
export async function getPaceComparison(userId: string, today: Date) {
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

  const [thisDaily, prevDaily, prevFull] = await Promise.all([
    getDailySpend(userId, thisRange.from, thisCut),
    getDailySpend(userId, prevRange.from, prevCut),
    getDailySpend(userId, prevRange.from, prevRange.to),
  ]);

  const sum = (rows: Array<{ spendMinor: number }>) =>
    rows.reduce((total, r) => total + r.spendMinor, 0);

  return {
    thisMonth,
    prevMonth,
    spendToDateMinor: sum(thisDaily),
    prevSpendSamePointMinor: sum(prevDaily),
    prevMonthTotalMinor: sum(prevFull),
    dailySeries: thisDaily,
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

export async function getTopMerchants(userId: string, from: string, to: string, limit = 12) {
  const result = await db.execute(sql`
    SELECT t.merchant_norm, max(t.merchant_display) AS merchant_display,
           max(t.category_id) AS category_id,
           sum(CASE WHEN t.direction = 'debit' THEN t.amount_minor ELSE -t.amount_minor END) AS spend_minor,
           count(*) AS txn_count
    FROM transactions t
    JOIN categories c ON c.id = t.category_id
    WHERE t.user_id = ${userId} AND c.kind = 'expense'
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

/** Data freshness: the latest transaction date and statement count. */
export async function getFreshness(userId: string) {
  const [row] = await db
    .select({
      latestDate: sql<string | null>`max(${transactions.txnDate})`,
      earliestDate: sql<string | null>`min(${transactions.txnDate})`,
      txnCount: sql<string>`count(*)`,
    })
    .from(transactions)
    .where(eq(transactions.userId, userId));
  const [stmts] = await db
    .select({ count: sql<string>`count(*)` })
    .from(statements)
    .where(eq(statements.userId, userId));
  return {
    latestDate: row?.latestDate ?? null,
    earliestDate: row?.earliestDate ?? null,
    transactionCount: num(row?.txnCount),
    statementCount: num(stmts?.count),
  };
}
