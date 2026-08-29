import { generateObject } from "ai";
import { and, eq, inArray, isNull, or } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db/client";
import { categories, categoryRules, merchantDictionary } from "@/db/schema";
import { categorizationModel, lowThinking, withRetry } from "./model.server";
import type { VerifiedTransaction } from "./verify";

/**
 * Hybrid categorization, cheapest first:
 *   1. the user's own rules (their corrections always win),
 *   2. the seeded merchant dictionary,
 *   3. one batched model call for merchants nothing else recognized.
 */

export type CategorizedTransaction = VerifiedTransaction & {
  categoryId: string;
  categorySource: "rule" | "dictionary" | "model" | "user";
};

type CategoryRow = { id: string; slug: string; name: string };

export async function loadCategoriesForUser(userId: string): Promise<CategoryRow[]> {
  return db
    .select({ id: categories.id, slug: categories.slug, name: categories.name })
    .from(categories)
    .where(or(isNull(categories.userId), eq(categories.userId, userId)));
}

export async function categorizeTransactions(
  userId: string,
  transactions: VerifiedTransaction[],
): Promise<CategorizedTransaction[]> {
  const categoryRows = await loadCategoriesForUser(userId);
  const bySlug = new Map(categoryRows.map((c) => [c.slug, c.id]));
  const validIds = new Set(categoryRows.map((c) => c.id));
  const uncategorizedId = bySlug.get("uncategorized") ?? categoryRows[0]?.id ?? "sys_uncategorized";

  const rules = await db.select().from(categoryRules).where(eq(categoryRules.userId, userId));
  const exactRules = new Map(
    rules.filter((r) => r.matchType === "merchant_exact").map((r) => [r.pattern, r.categoryId]),
  );
  const containsRules = rules.filter((r) => r.matchType === "contains");

  const distinctMerchants = [...new Set(transactions.map((t) => t.merchantNorm))];
  const dictRows =
    distinctMerchants.length > 0
      ? await db
          .select()
          .from(merchantDictionary)
          .where(inArray(merchantDictionary.merchantNorm, distinctMerchants))
      : [];
  const dictionary = new Map(dictRows.map((d) => [d.merchantNorm, d]));

  const resolved = new Map<
    string,
    { categoryId: string; source: "rule" | "dictionary" | "model" }
  >();
  const unknown: string[] = [];

  for (const merchant of distinctMerchants) {
    const ruleCategory = exactRules.get(merchant) ?? matchContains(containsRules, merchant);
    if (ruleCategory && validIds.has(ruleCategory)) {
      resolved.set(merchant, { categoryId: ruleCategory, source: "rule" });
      continue;
    }
    const dict = dictionary.get(merchant) ?? matchDictionaryPrefix(dictRows, merchant);
    if (dict) {
      const categoryId = bySlug.get(dict.categorySlug);
      if (categoryId) {
        resolved.set(merchant, { categoryId, source: "dictionary" });
        continue;
      }
    }
    unknown.push(merchant);
  }

  if (unknown.length > 0) {
    const modelAssignments = await categorizeUnknownMerchants(unknown, transactions, categoryRows);
    for (const [merchant, slug] of modelAssignments) {
      const categoryId = bySlug.get(slug);
      resolved.set(merchant, {
        categoryId: categoryId ?? uncategorizedId,
        source: "model",
      });
    }
  }

  return transactions.map((t) => {
    const match = resolved.get(t.merchantNorm);
    return {
      ...t,
      categoryId: match?.categoryId ?? uncategorizedId,
      categorySource: match?.source ?? "model",
    };
  });
}

function matchContains(
  rules: Array<{ pattern: string; categoryId: string }>,
  merchant: string,
): string | undefined {
  for (const rule of rules) {
    if (merchant.includes(rule.pattern)) return rule.categoryId;
  }
  return undefined;
}

/** "CARREFOUR MARKET AL BARSHA" should still hit the "CARREFOUR" dictionary row. */
function matchDictionaryPrefix(
  dictRows: Array<{ merchantNorm: string; displayName: string; categorySlug: string }>,
  merchant: string,
): { categorySlug: string } | undefined {
  for (const row of dictRows) {
    if (
      merchant.startsWith(`${row.merchantNorm} `) ||
      row.merchantNorm.startsWith(`${merchant} `)
    ) {
      return row;
    }
  }
  return undefined;
}

async function categorizeUnknownMerchants(
  merchants: string[],
  transactions: VerifiedTransaction[],
  categoryRows: CategoryRow[],
): Promise<Map<string, string>> {
  const slugs = categoryRows.map((c) => c.slug);
  const samples = new Map<string, { description: string; direction: string }>();
  for (const t of transactions) {
    if (!samples.has(t.merchantNorm)) {
      samples.set(t.merchantNorm, { description: t.description, direction: t.direction });
    }
  }

  const schema = z.object({
    assignments: z.array(
      z.object({
        merchant: z.string(),
        categorySlug: z.string(),
      }),
    ),
  });

  const input = merchants.map((m) => ({
    merchant: m,
    sampleDescription: samples.get(m)?.description ?? m,
    direction: samples.get(m)?.direction ?? "debit",
  }));

  try {
    const result = await withRetry(() =>
      generateObject({
        model: categorizationModel(),
        schema,
        system: `Assign each merchant to exactly one category slug from this list: ${slugs.join(", ")}.
Rules: use the sample transaction description and direction as context. "credit" direction with salary-like descriptions is "income"; refunds keep the merchant's normal category. When genuinely unsure, use "uncategorized". Output one assignment per input merchant.`,
        prompt: JSON.stringify(input),
        providerOptions: lowThinking,
      }),
    );
    const valid = new Set(slugs);
    const map = new Map<string, string>();
    for (const a of result.object.assignments) {
      map.set(a.merchant, valid.has(a.categorySlug) ? a.categorySlug : "uncategorized");
    }
    // any merchant the model skipped falls back to uncategorized
    for (const m of merchants) {
      if (!map.has(m)) map.set(m, "uncategorized");
    }
    return map;
  } catch {
    return new Map(merchants.map((m) => [m, "uncategorized"]));
  }
}
