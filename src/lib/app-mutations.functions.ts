import { createServerFn } from "@tanstack/react-start";
import { and, eq, inArray, isNull, ne, or } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db/client";
import { budgets, categories, categoryRules, transactions } from "@/db/schema";
import { getFreshness } from "@/lib/analytics/aggregates.server";
import { CHART_SLOTS, nextChartSlot } from "@/lib/categories";
import { authMiddleware } from "@/lib/auth-middleware";

/**
 * Re-categorize transactions; optionally learn a merchant rule and re-apply it
 * to the user's other transactions from the same merchants (except rows the
 * user already categorized by hand).
 */
export const recategorizeFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .inputValidator(
    z.object({
      transactionIds: z.array(z.string()).min(1).max(1000),
      categoryId: z.string().min(1),
      createRule: z.boolean().default(false),
    }),
  )
  .handler(async ({ data, context }) => {
    const userId = context.userId;

    const owned = await db
      .select({ id: transactions.id, merchantNorm: transactions.merchantNorm })
      .from(transactions)
      .where(and(eq(transactions.userId, userId), inArray(transactions.id, data.transactionIds)));
    if (owned.length === 0) return { updated: 0, ruleApplied: 0 };

    const [category] = await db
      .select({ id: categories.id })
      .from(categories)
      .where(
        and(
          eq(categories.id, data.categoryId),
          or(isNull(categories.userId), eq(categories.userId, userId)),
        ),
      );
    if (!category) throw new Error("Unknown category");

    await db
      .update(transactions)
      .set({ categoryId: data.categoryId, categorySource: "user" })
      .where(
        and(
          eq(transactions.userId, userId),
          inArray(
            transactions.id,
            owned.map((t) => t.id),
          ),
        ),
      );

    let ruleApplied = 0;
    if (data.createRule) {
      const merchants = [...new Set(owned.map((t) => t.merchantNorm))];
      for (const merchant of merchants) {
        await db
          .insert(categoryRules)
          .values({
            id: crypto.randomUUID(),
            userId,
            matchType: "merchant_exact",
            pattern: merchant,
            categoryId: data.categoryId,
          })
          .onConflictDoUpdate({
            target: [categoryRules.userId, categoryRules.matchType, categoryRules.pattern],
            set: { categoryId: data.categoryId },
          });
      }
      // re-apply to the merchant's other transactions, without overriding manual picks
      const applied = await db
        .update(transactions)
        .set({ categoryId: data.categoryId, categorySource: "rule" })
        .where(
          and(
            eq(transactions.userId, userId),
            inArray(transactions.merchantNorm, merchants),
            ne(transactions.categorySource, "user"),
            ne(transactions.categoryId, data.categoryId),
          ),
        )
        .returning({ id: transactions.id });
      ruleApplied = applied.length;
    }

    return { updated: owned.length, ruleApplied };
  });

export const deleteRuleFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .inputValidator(z.object({ ruleId: z.string().min(1) }))
  .handler(async ({ data, context }) => {
    await db
      .delete(categoryRules)
      .where(and(eq(categoryRules.id, data.ruleId), eq(categoryRules.userId, context.userId)));
    return { ok: true };
  });

export const upsertBudgetFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .inputValidator(
    z.object({
      categoryId: z.string().min(1),
      monthlyLimitMinor: z.number().int().positive().max(1_000_000_000_000),
    }),
  )
  .handler(async ({ data, context }) => {
    const { primaryCurrency } = await getFreshness(context.userId);
    await db
      .insert(budgets)
      .values({
        id: crypto.randomUUID(),
        userId: context.userId,
        categoryId: data.categoryId,
        monthlyLimitMinor: data.monthlyLimitMinor,
        currency: primaryCurrency,
      })
      .onConflictDoUpdate({
        target: [budgets.userId, budgets.categoryId],
        set: { monthlyLimitMinor: data.monthlyLimitMinor },
      });
    return { ok: true };
  });

export const deleteBudgetFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .inputValidator(z.object({ budgetId: z.string().min(1) }))
  .handler(async ({ data, context }) => {
    await db
      .delete(budgets)
      .where(and(eq(budgets.id, data.budgetId), eq(budgets.userId, context.userId)));
    return { ok: true };
  });

export const createCategoryFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .inputValidator(
    z.object({
      name: z.string().min(2).max(40),
      kind: z.enum(["expense", "income"]).default("expense"),
    }),
  )
  .handler(async ({ data, context }) => {
    const userId = context.userId;
    const slug = data.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40);
    if (!slug) throw new Error("Invalid category name");

    const existing = await db
      .select({ color: categories.color })
      .from(categories)
      .where(or(isNull(categories.userId), eq(categories.userId, userId)));

    const id = crypto.randomUUID();
    await db.insert(categories).values({
      id,
      userId,
      slug,
      name: data.name.trim(),
      icon: "tag",
      color: nextChartSlot(existing.map((c) => c.color).filter((c) => CHART_SLOTS.includes(c))),
      kind: data.kind,
      sortOrder: 100,
    });
    return { id, slug };
  });
