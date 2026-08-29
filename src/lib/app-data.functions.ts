import { createServerFn } from "@tanstack/react-start";
import { and, desc, eq, gte, ilike, inArray, lte, or, sql } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db/client";
import {
  budgets,
  categories,
  categoryRules,
  recurringSeries,
  statements,
  transactions,
} from "@/db/schema";
import {
  getBudgetStatuses,
  getDailySpend,
  getFreshness,
  getMonthlyTotals,
  getPaceComparison,
  getSpendByCategory,
  getTopMerchants,
  monthRange,
  type MonthKey,
} from "@/lib/analytics/aggregates.server";
import { getInsights } from "@/lib/analytics/insights.server";
import { authMiddleware } from "@/lib/auth-middleware";
import { minorUnitFactor } from "@/lib/money";

export const getCategoriesFn = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const rows = await db
      .select({
        id: categories.id,
        slug: categories.slug,
        name: categories.name,
        icon: categories.icon,
        color: categories.color,
        kind: categories.kind,
        userId: categories.userId,
        sortOrder: categories.sortOrder,
      })
      .from(categories)
      .where(or(sql`${categories.userId} is null`, eq(categories.userId, context.userId)))
      .orderBy(categories.sortOrder, categories.name);
    return rows;
  });

export const getDashboardFn = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .inputValidator(
    z
      .object({
        month: z
          .string()
          .regex(/^\d{4}-\d{2}$/)
          .optional(),
      })
      .default({}),
  )
  .handler(async ({ data, context }) => {
    const userId = context.userId;
    const today = new Date();
    const freshness = await getFreshness(userId);

    let anchor: Date;
    if (data.month) {
      // an explicitly chosen month: anchor to its end (or today, if current)
      const [y, m] = data.month.split("-").map(Number);
      const monthEnd = new Date(y as number, m as number, 0);
      anchor = monthEnd < today ? monthEnd : today;
    } else {
      // default: the latest month that actually has transactions — an August
      // dashboard full of zeros over July data is misleading, not honest
      anchor = today;
      if (freshness.latestDate) {
        const latest = new Date(`${freshness.latestDate.slice(0, 10)}T00:00:00`);
        const sameMonth =
          latest.getFullYear() === today.getFullYear() && latest.getMonth() === today.getMonth();
        if (!sameMonth && latest < today) {
          anchor = new Date(latest.getFullYear(), latest.getMonth() + 1, 0);
        }
      }
    }
    const isCurrentMonth =
      anchor.getFullYear() === today.getFullYear() && anchor.getMonth() === today.getMonth();
    const month =
      `${anchor.getFullYear()}-${String(anchor.getMonth() + 1).padStart(2, "0")}` as MonthKey;
    const currency = freshness.primaryCurrency;

    const { from: monthFrom, to: monthTo } = monthRange(month);

    // one parallel wave — the fewer sequential round trips to the database,
    // the faster the page paints
    const [pace, byCategory, budgetStatuses, monthly, transferTotals, recent, upcoming, anomalies] =
      await Promise.all([
        getPaceComparison(userId, anchor, currency),
        getSpendByCategory(userId, month, currency),
        getBudgetStatuses(userId, anchor),
        getMonthlyTotals(userId, 6, currency),
        db
          .select({
            outMinor: sql<string>`coalesce(sum(${transactions.amountMinor}) filter (where ${transactions.direction} = 'debit'), 0)`,
            inMinor: sql<string>`coalesce(sum(${transactions.amountMinor}) filter (where ${transactions.direction} = 'credit'), 0)`,
          })
          .from(transactions)
          .innerJoin(categories, eq(transactions.categoryId, categories.id))
          .where(
            and(
              eq(transactions.userId, userId),
              eq(categories.kind, "transfer"),
              eq(transactions.currency, currency),
              gte(transactions.txnDate, monthFrom),
              lte(transactions.txnDate, monthTo),
            ),
          ),
        db
          .select({
            id: transactions.id,
            txnDate: transactions.txnDate,
            merchantDisplay: transactions.merchantDisplay,
            description: transactions.description,
            amountMinor: transactions.amountMinor,
            direction: transactions.direction,
            currency: transactions.currency,
            categoryId: transactions.categoryId,
          })
          .from(transactions)
          .where(eq(transactions.userId, userId))
          .orderBy(desc(transactions.txnDate), desc(transactions.createdAt))
          .limit(10),
        db
          .select()
          .from(recurringSeries)
          .where(and(eq(recurringSeries.userId, userId), eq(recurringSeries.active, true)))
          .orderBy(recurringSeries.nextExpected)
          .limit(4),
        db
          .select({
            id: transactions.id,
            txnDate: transactions.txnDate,
            merchantDisplay: transactions.merchantDisplay,
            amountMinor: transactions.amountMinor,
            currency: transactions.currency,
            categoryId: transactions.categoryId,
          })
          .from(transactions)
          .where(and(eq(transactions.userId, userId), eq(transactions.isAnomaly, true)))
          .orderBy(desc(transactions.txnDate))
          .limit(5),
      ]);

    return {
      month,
      isCurrentMonth,
      currency,
      pace,
      byCategory,
      budgets: budgetStatuses,
      freshness,
      monthly,
      transfers: {
        outMinor: Number(transferTotals[0]?.outMinor ?? 0),
        inMinor: Number(transferTotals[0]?.inMinor ?? 0),
      },
      recent,
      upcoming,
      anomalies,
    };
  });

/**
 * Insights are the one model-generated piece of the dashboard, so they load
 * as their own query — the numbers must never wait on a language model.
 */
export const getInsightsFn = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .inputValidator(z.object({ month: z.string().regex(/^\d{4}-\d{2}$/) }))
  .handler(async ({ data, context }) => {
    const userId = context.userId;
    const month = data.month as MonthKey;
    const { to } = monthRange(month);
    const anchor = new Date(`${to}T00:00:00`);
    const today = new Date();
    const effectiveAnchor = anchor < today ? anchor : today;

    const freshness = await getFreshness(userId);
    const currency = freshness.primaryCurrency;
    const factor = minorUnitFactor(currency);

    const [pace, byCategory, budgetStatuses, monthly] = await Promise.all([
      getPaceComparison(userId, effectiveAnchor, currency),
      getSpendByCategory(userId, month, currency),
      getBudgetStatuses(userId, effectiveAnchor),
      getMonthlyTotals(userId, 2, currency),
    ]);
    if (byCategory.length === 0 && pace.spendToDateMinor === 0) return { insights: [] };

    const thisMonthTotals = monthly.find((m) => m.month === month);
    const prevMonthComparable = pace.prevCoverage >= 0.85;
    const insights = await getInsights(userId, month, {
      month,
      spendToDate: pace.spendToDateMinor / factor,
      // a partial previous month must never read as a real comparison
      previousMonthSamePoint: prevMonthComparable ? pace.prevSpendSamePointMinor / factor : null,
      previousMonthTotal: prevMonthComparable ? pace.prevMonthTotalMinor / factor : null,
      previousMonthDataPartial: !prevMonthComparable,
      incomeThisMonth: (thisMonthTotals?.incomeMinor ?? 0) / factor,
      topCategories: byCategory.slice(0, 5).map((c) => ({
        name: c.name,
        spend: c.spendMinor / factor,
      })),
      budgets: budgetStatuses.map((b) => ({
        category: b.categoryName,
        limit: b.limitMinor / factor,
        spent: b.spentMinor / factor,
        projected: b.projectedMinor / factor,
      })),
      currency,
    });
    return { insights };
  });

const TransactionFiltersSchema = z.object({
  q: z.string().max(200).optional(),
  categoryId: z.string().optional(),
  direction: z.enum(["debit", "credit"]).optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  statementId: z.string().optional(),
  offset: z.number().int().nonnegative().default(0),
  limit: z.number().int().min(1).max(500).default(200),
});

export type TransactionFilters = z.infer<typeof TransactionFiltersSchema>;

function transactionConditions(userId: string, f: TransactionFilters) {
  const conditions = [eq(transactions.userId, userId)];
  if (f.q) {
    const escaped = f.q.replace(/[%_\\]/g, "\\$&");
    const clause = or(
      ilike(transactions.description, `%${escaped}%`),
      ilike(transactions.merchantDisplay, `%${escaped}%`),
    );
    if (clause) conditions.push(clause);
  }
  if (f.categoryId) conditions.push(eq(transactions.categoryId, f.categoryId));
  if (f.direction) conditions.push(eq(transactions.direction, f.direction));
  if (f.from) conditions.push(gte(transactions.txnDate, f.from));
  if (f.to) conditions.push(lte(transactions.txnDate, f.to));
  if (f.statementId) conditions.push(eq(transactions.statementId, f.statementId));
  return and(...conditions);
}

export const getTransactionsFn = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .inputValidator(TransactionFiltersSchema)
  .handler(async ({ data, context }) => {
    const where = transactionConditions(context.userId, data);
    const [rows, [totals]] = await Promise.all([
      db
        .select({
          id: transactions.id,
          txnDate: transactions.txnDate,
          description: transactions.description,
          merchantDisplay: transactions.merchantDisplay,
          merchantNorm: transactions.merchantNorm,
          amountMinor: transactions.amountMinor,
          direction: transactions.direction,
          currency: transactions.currency,
          categoryId: transactions.categoryId,
          categorySource: transactions.categorySource,
          isAnomaly: transactions.isAnomaly,
          statementId: transactions.statementId,
          // an internal move seen from both accounts: this transfer row has an
          // opposite-direction twin (same amount, ±3 days) in another statement.
          // Columns are qualified by hand — drizzle renders bare identifiers
          // here, which are ambiguous inside the correlated subquery.
          matchedTransfer: sql<boolean>`(
            exists (
              select 1 from categories ca
              where ca.id = "transactions"."category_id" and ca.kind = 'transfer'
            )
            and exists (
              select 1 from transactions b
              join categories cb on cb.id = b.category_id
              where b.user_id = "transactions"."user_id"
                and b.amount_minor = "transactions"."amount_minor"
                and b.direction != "transactions"."direction"
                and b.statement_id != "transactions"."statement_id"
                and abs(b.txn_date - "transactions"."txn_date") <= 3
                and cb.kind = 'transfer'
            )
          )`,
        })
        .from(transactions)
        .where(where)
        .orderBy(desc(transactions.txnDate), desc(transactions.createdAt))
        .offset(data.offset)
        .limit(data.limit),
      db
        .select({
          count: sql<string>`count(*)`,
          debitMinor: sql<string>`coalesce(sum(${transactions.amountMinor}) filter (where ${transactions.direction} = 'debit'), 0)`,
          creditMinor: sql<string>`coalesce(sum(${transactions.amountMinor}) filter (where ${transactions.direction} = 'credit'), 0)`,
          currency: sql<string | null>`mode() within group (order by ${transactions.currency})`,
        })
        .from(transactions)
        .where(where),
    ]);
    return {
      rows,
      total: Number(totals?.count ?? 0),
      totalDebitMinor: Number(totals?.debitMinor ?? 0),
      totalCreditMinor: Number(totals?.creditMinor ?? 0),
      currency: totals?.currency ?? "AED",
    };
  });

export const exportTransactionsFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .inputValidator(TransactionFiltersSchema)
  .handler(async ({ data, context }) => {
    const where = transactionConditions(context.userId, data);
    const rows = await db
      .select({
        txnDate: transactions.txnDate,
        description: transactions.description,
        merchant: transactions.merchantDisplay,
        amountMinor: transactions.amountMinor,
        direction: transactions.direction,
        currency: transactions.currency,
        category: categories.name,
      })
      .from(transactions)
      .innerJoin(categories, eq(transactions.categoryId, categories.id))
      .where(where)
      .orderBy(desc(transactions.txnDate))
      .limit(20000);

    const escapeCsv = (value: string) =>
      /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
    const header = "Date,Description,Merchant,Category,Direction,Amount,Currency";
    const lines = rows.map((r) =>
      [
        r.txnDate,
        escapeCsv(r.description),
        escapeCsv(r.merchant),
        escapeCsv(r.category),
        r.direction,
        (r.direction === "debit" ? -r.amountMinor : r.amountMinor) / minorUnitFactor(r.currency),
        r.currency,
      ].join(","),
    );
    return { csv: [header, ...lines].join("\n"), count: rows.length };
  });

export const getStatementsFn = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    return db
      .select()
      .from(statements)
      .where(eq(statements.userId, context.userId))
      .orderBy(desc(statements.createdAt));
  });

export const getRecurringFn = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    return db
      .select()
      .from(recurringSeries)
      .where(eq(recurringSeries.userId, context.userId))
      .orderBy(recurringSeries.nextExpected);
  });

export const getBudgetsFn = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    return getBudgetStatuses(context.userId, new Date());
  });

export const getRulesFn = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    return db
      .select({
        id: categoryRules.id,
        matchType: categoryRules.matchType,
        pattern: categoryRules.pattern,
        categoryId: categoryRules.categoryId,
        categoryName: categories.name,
      })
      .from(categoryRules)
      .innerJoin(categories, eq(categoryRules.categoryId, categories.id))
      .where(eq(categoryRules.userId, context.userId))
      .orderBy(categoryRules.pattern);
  });

const ReportsInputSchema = z.object({
  month: z.string().regex(/^\d{4}-\d{2}$/),
});

export const getReportsFn = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .inputValidator(ReportsInputSchema)
  .handler(async ({ data, context }) => {
    const userId = context.userId;
    const month = data.month as MonthKey;
    const { from, to } = monthRange(month);

    const freshness = await getFreshness(userId);
    const currency = freshness.primaryCurrency;

    const [monthly, daily, topMerchants, byCategory, trendResult] = await Promise.all([
      getMonthlyTotals(userId, 12, currency),
      getDailySpend(userId, from, to, currency),
      getTopMerchants(userId, from, to, currency),
      getSpendByCategory(userId, month, currency),
      db.execute(sql`
        SELECT to_char(date_trunc('month', t.txn_date), 'YYYY-MM') AS month,
               c.id AS category_id, c.name, c.color,
               sum(CASE WHEN t.direction = 'debit' THEN t.amount_minor ELSE -t.amount_minor END) AS spend_minor
        FROM transactions t
        JOIN categories c ON c.id = t.category_id
        WHERE t.user_id = ${userId} AND t.currency = ${currency} AND c.kind = 'expense'
          AND t.txn_date >= date_trunc('month', now())::date - interval '6 months'
        GROUP BY 1, 2, 3, 4
        ORDER BY 1
      `),
    ]);

    const categoryTrend = (trendResult.rows as Array<Record<string, unknown>>).map((r) => ({
      month: String(r["month"]),
      categoryId: String(r["category_id"]),
      name: String(r["name"]),
      color: String(r["color"]),
      spendMinor: Number(r["spend_minor"] ?? 0),
    }));

    return { monthly, daily, topMerchants, byCategory, categoryTrend, currency };
  });

/** Day-level transactions for the calendar drill-down. */
export const getDayTransactionsFn = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .inputValidator(z.object({ day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }))
  .handler(async ({ data, context }) => {
    return db
      .select({
        id: transactions.id,
        merchantDisplay: transactions.merchantDisplay,
        description: transactions.description,
        amountMinor: transactions.amountMinor,
        direction: transactions.direction,
        currency: transactions.currency,
        categoryId: transactions.categoryId,
      })
      .from(transactions)
      .where(and(eq(transactions.userId, context.userId), eq(transactions.txnDate, data.day)))
      .orderBy(desc(transactions.amountMinor));
  });
