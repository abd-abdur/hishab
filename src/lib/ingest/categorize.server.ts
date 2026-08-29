import { generateObject } from "ai";
import { and, eq, inArray, isNull, or } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db/client";
import { categories, categoryRules, merchantDictionary, user } from "@/db/schema";
import {
  categorizationModel,
  minimalThinking,
  MODEL_CALL_TIMEOUT_MS,
  withRetry,
} from "./model.server";
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

/**
 * Deterministic person-to-person classification for "TO <name>" / "FROM
 * <name>" transfer rows. A counterparty sharing a name token with the account
 * holder is the holder's own account (a transfer); anyone else is real money
 * leaving or arriving — spending or income.
 */
export function classifyP2P(
  merchantNorm: string,
  holderTokens: Set<string>,
): "self" | "out" | "in" | null {
  const match = merchantNorm.match(/^(TO|FROM)\s+(.+)$/);
  if (!match) return null;
  const counterparty = (match[2] ?? "").split(/[^A-Z]+/).filter((w) => w.length >= 3);
  const isSelf = counterparty.some((token) => holderTokens.has(token));
  if (isSelf) return "self";
  return match[1] === "TO" ? "out" : "in";
}

/**
 * Card-repayment credits, deterministically. Banks phrase these as
 * "PAYMENT RECEIVED - THANK YOU", "TRANSFER PAYMENT RECEIVED", "CREDIT
 * REPAYMENT AUTOPAY" — money arriving on a card from the holder's own
 * account. Always a transfer; never income, never "received from people".
 */
export function isCardRepayment(merchantNorm: string, direction: "debit" | "credit"): boolean {
  if (direction !== "credit") return false;
  return (
    /\b(REPAYMENT|AUTOPAY)\b/.test(merchantNorm) ||
    /\b(PAYMENT|TRANSFER)\s+(PAYMENT\s+)?RECEIVED\b/.test(merchantNorm) ||
    /\bRECEIVED\b.*\bTHANK\s?YOU\b/.test(merchantNorm) ||
    /\bTHANK\s?YOU\b/.test(merchantNorm)
  );
}

export function holderNameTokens(name: string): Set<string> {
  return new Set(
    name
      .toUpperCase()
      .split(/[^A-Z]+/)
      .filter((w) => w.length >= 3),
  );
}

export async function categorizeTransactions(
  userId: string,
  transactions: VerifiedTransaction[],
): Promise<CategorizedTransaction[]> {
  const categoryRows = await loadCategoriesForUser(userId);
  const bySlug = new Map(categoryRows.map((c) => [c.slug, c.id]));
  const validIds = new Set(categoryRows.map((c) => c.id));
  const uncategorizedId = bySlug.get("uncategorized") ?? categoryRows[0]?.id ?? "sys_uncategorized";

  const [holder] = await db.select({ name: user.name }).from(user).where(eq(user.id, userId));
  const holderTokens = holderNameTokens(holder?.name ?? "");

  const rules = await db.select().from(categoryRules).where(eq(categoryRules.userId, userId));
  const exactRules = new Map(
    rules.filter((r) => r.matchType === "merchant_exact").map((r) => [r.pattern, r.categoryId]),
  );
  const containsRules = rules.filter((r) => r.matchType === "contains");

  const distinctMerchants = [...new Set(transactions.map((t) => t.merchantNorm))];
  // Dictionary keys are short ("CARREFOUR"), merchant norms are longer
  // ("CARREFOUR MOE") — fetch candidates for every leading word-prefix so the
  // prefix matcher has rows to work with.
  const candidates = new Set<string>();
  for (const merchant of distinctMerchants) {
    const words = merchant.split(" ");
    for (let take = 1; take <= Math.min(words.length, 4); take++) {
      candidates.add(words.slice(0, take).join(" "));
    }
  }
  const dictRows =
    candidates.size > 0
      ? await db
          .select()
          .from(merchantDictionary)
          .where(inArray(merchantDictionary.merchantNorm, [...candidates]))
      : [];
  const dictionary = new Map(dictRows.map((d) => [d.merchantNorm, d]));

  const resolved = new Map<
    string,
    { categoryId: string; source: "rule" | "dictionary" | "model" }
  >();
  const unknown: string[] = [];

  const directionByMerchant = new Map<string, "debit" | "credit">();
  for (const t of transactions) {
    if (!directionByMerchant.has(t.merchantNorm)) {
      directionByMerchant.set(t.merchantNorm, t.direction);
    }
  }

  for (const merchant of distinctMerchants) {
    const ruleCategory = exactRules.get(merchant) ?? matchContains(containsRules, merchant);
    if (ruleCategory && validIds.has(ruleCategory)) {
      resolved.set(merchant, { categoryId: ruleCategory, source: "rule" });
      continue;
    }
    // card repayments and person-to-person rows are decided deterministically,
    // never by the model
    if (isCardRepayment(merchant, directionByMerchant.get(merchant) ?? "debit")) {
      const transfersId = bySlug.get("transfers");
      if (transfersId) {
        resolved.set(merchant, { categoryId: transfersId, source: "dictionary" });
        continue;
      }
    }
    const p2p = classifyP2P(merchant, holderTokens);
    if (p2p) {
      const slug = p2p === "self" ? "transfers" : p2p === "out" ? "p2p-out" : "p2p-in";
      const categoryId = bySlug.get(slug);
      if (categoryId) {
        resolved.set(merchant, { categoryId, source: "dictionary" });
        continue;
      }
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
  // longest dictionary key matching on a word boundary wins
  let best: { merchantNorm: string; displayName: string; categorySlug: string } | undefined;
  for (const row of dictRows) {
    if (merchant === row.merchantNorm || merchant.startsWith(`${row.merchantNorm} `)) {
      if (!best || row.merchantNorm.length > best.merchantNorm.length) best = row;
    }
  }
  return best;
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
Rules: use the sample transaction description and direction as context. "credit" direction with salary-like descriptions is "income"; refunds keep the merchant's normal category. Bank charges — FX/international spend markup, card fees, VAT lines, service charges — are "fees", never the category they relate to (an "international card spend fee" is NOT travel). Purchases made through buy-now-pay-later providers (Tabby, Tamara, Postpay) are "bnpl" — but credit-card repayments, autopay debits, "payment received" lines, and moves between the user's own accounts are "transfers", never "bnpl" and never "income". Money clearly sent to another person is "p2p-out"; money clearly received from another person is "p2p-in". A credit line phrased like "payment received", "transfer received", or "thank you" on a card statement is the holder repaying their own card — always "transfers", never "p2p-in" and never "income". When genuinely unsure, use "uncategorized". Output one assignment per input merchant.`,
        prompt: JSON.stringify(input),
        providerOptions: minimalThinking,
        abortSignal: AbortSignal.timeout(MODEL_CALL_TIMEOUT_MS),
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
