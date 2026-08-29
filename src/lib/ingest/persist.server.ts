import { and, eq, gte, inArray, lte, sql } from "drizzle-orm";

import { db } from "@/db/client";
import { categories, recurringSeries, statements, transactions } from "@/db/schema";
import { detectRecurringSeries } from "@/lib/analytics/recurring";
import type { CommitInput } from "./draft-schema";

export type CommitResult = {
  statementId: string;
  inserted: number;
  skippedDuplicates: number;
  /** distinct calendar months the user now has data for */
  monthsWithData: number;
};

export async function commitStatement(userId: string, input: CommitInput): Promise<CommitResult> {
  const statementId = crypto.randomUUID();
  const meta = input.statement;

  await db.insert(statements).values({
    id: statementId,
    userId,
    fileName: meta.fileName,
    fileType: meta.fileType,
    bankName: meta.bankName,
    accountNumberMasked: meta.accountNumberMasked,
    currency: meta.currency,
    periodStart: meta.periodStart,
    periodEnd: meta.periodEnd,
    openingBalanceMinor: meta.openingBalanceMinor,
    closingBalanceMinor: meta.closingBalanceMinor,
    reconciliationStatus: meta.reconciliationStatus,
    reconciliationDeltaMinor: meta.reconciliationDeltaMinor,
  });

  const inserted = await db
    .insert(transactions)
    .values(
      input.rows.map((row) => ({
        id: crypto.randomUUID(),
        userId,
        statementId,
        txnDate: row.txnDate,
        description: row.description,
        merchantNorm: row.merchantNorm,
        merchantDisplay: row.merchantDisplay,
        amountMinor: row.amountMinor,
        direction: row.direction,
        runningBalanceMinor: row.runningBalanceMinor,
        currency: meta.currency,
        categoryId: row.categoryId,
        categorySource: row.categorySource,
        confidence: row.confidence,
        dedupHash: row.dedupHash,
      })),
    )
    .onConflictDoNothing({ target: [transactions.userId, transactions.dedupHash] })
    .returning({ id: transactions.id });

  const insertedCount = inserted.length;
  const skipped = input.rows.length - insertedCount;

  // Every row was already in the account: don't keep an empty statement
  // shell wearing a meaningless reconciliation badge.
  if (insertedCount === 0) {
    await db.delete(statements).where(eq(statements.id, statementId));
    const monthsResult0 = await db.execute(sql`
      SELECT count(DISTINCT date_trunc('month', txn_date)) AS months
      FROM transactions WHERE user_id = ${userId}
    `);
    return {
      statementId: "",
      inserted: 0,
      skippedDuplicates: skipped,
      monthsWithData: Number(
        (monthsResult0.rows as Array<Record<string, unknown>>)[0]?.["months"] ?? 0,
      ),
    };
  }

  await db
    .update(statements)
    .set({ transactionCount: insertedCount, duplicateCount: skipped })
    .where(eq(statements.id, statementId));

  await reclassifyMatchedTransfers(userId);
  await refreshRecurringSeries(userId);
  await refreshAnomalyFlags(userId);

  const monthsResult = await db.execute(sql`
    SELECT count(DISTINCT date_trunc('month', txn_date)) AS months
    FROM transactions WHERE user_id = ${userId}
  `);
  const monthsWithData = Number(
    (monthsResult.rows as Array<Record<string, unknown>>)[0]?.["months"] ?? 0,
  );

  return { statementId, inserted: insertedCount, skippedDuplicates: skipped, monthsWithData };
}

export async function deleteStatement(userId: string, statementId: string): Promise<void> {
  await db
    .delete(statements)
    .where(and(eq(statements.id, statementId), eq(statements.userId, userId)));
  await refreshRecurringSeries(userId);
}

/** Recompute the user's recurring series from scratch — deterministic, idempotent. */
export async function refreshRecurringSeries(userId: string): Promise<void> {
  const debits = await db
    .select({
      merchantNorm: transactions.merchantNorm,
      merchantDisplay: transactions.merchantDisplay,
      categoryId: transactions.categoryId,
      categorySlug: categories.slug,
      txnDate: transactions.txnDate,
      amountMinor: transactions.amountMinor,
      currency: transactions.currency,
    })
    .from(transactions)
    .innerJoin(categories, eq(transactions.categoryId, categories.id))
    .where(and(eq(transactions.userId, userId), eq(transactions.direction, "debit")));

  const detected = detectRecurringSeries(debits);

  await db.delete(recurringSeries).where(eq(recurringSeries.userId, userId));
  if (detected.length > 0) {
    await db.insert(recurringSeries).values(
      detected.map((s) => ({
        id: crypto.randomUUID(),
        userId,
        merchantNorm: s.merchantNorm,
        merchantDisplay: s.merchantDisplay,
        categoryId: s.categoryId,
        cadence: s.cadence,
        avgAmountMinor: s.avgAmountMinor,
        lastAmountMinor: s.lastAmountMinor,
        previousAmountMinor: s.previousAmountMinor,
        priceChangedAt: s.priceChangedAt,
        currency: s.currency,
        occurrences: s.occurrences,
        lastSeen: s.lastSeen,
        nextExpected: s.nextExpected,
        active: true,
      })),
    );
  }
}

/**
 * A debit is flagged unusual when it exceeds 3× the median debit of its
 * EXPENSE category (with a floor of AED 100). A category needs at least four
 * debits before it has a "usual" — a lone hotel booking is not above
 * anything — and transfers never flag: moving your own money isn't spending.
 */
async function refreshAnomalyFlags(userId: string): Promise<void> {
  await db.execute(sql`
    WITH category_medians AS (
      SELECT t.category_id,
             percentile_cont(0.5) WITHIN GROUP (ORDER BY t.amount_minor) AS median_amount,
             count(*) AS sample_count
      FROM transactions t
      JOIN categories c ON c.id = t.category_id
      WHERE t.user_id = ${userId} AND t.direction = 'debit' AND c.kind = 'expense'
      GROUP BY t.category_id
    )
    UPDATE transactions t
    SET is_anomaly = COALESCE(
      t.direction = 'debit'
      AND m.sample_count >= 4
      AND t.amount_minor > GREATEST(m.median_amount * 3, 10000),
      false
    )
    FROM categories c
    LEFT JOIN category_medians m ON m.category_id = c.id
    WHERE t.user_id = ${userId} AND t.category_id = c.id
      AND t.is_anomaly != COALESCE(
        t.direction = 'debit'
        AND m.sample_count >= 4
        AND t.amount_minor > GREATEST(m.median_amount * 3, 10000),
        false
      )
  `);
}

/**
 * A person-to-person row with an opposite-direction twin in another statement
 * (same amount, ±3 days) is really an own-account move seen from both sides —
 * name matching can miss a nickname, but a matched pair never lies. Flip such
 * rows to Transfers unless the user categorized them by hand.
 */
export async function reclassifyMatchedTransfers(userId: string): Promise<void> {
  await db.execute(sql`
    UPDATE transactions t
    SET category_id = 'sys_transfers', category_source = 'dictionary'
    FROM categories c
    WHERE c.id = t.category_id
      AND t.user_id = ${userId}
      AND c.slug IN ('p2p-out', 'p2p-in')
      AND t.category_source != 'user'
      AND EXISTS (
        SELECT 1 FROM transactions b
        WHERE b.user_id = t.user_id
          AND b.amount_minor = t.amount_minor
          AND b.direction != t.direction
          AND b.statement_id != t.statement_id
          AND abs(b.txn_date - t.txn_date) <= 3
      )
  `);
}

/**
 * Cross-document near-duplicates: rows whose (date, amount, direction)
 * already exist under a DIFFERENT merchant label — the signature of a fee
 * invoice or overlapping export describing charges another statement already
 * carries. Exact same-label duplicates are handled by the dedup hash.
 */
export async function findSimilarRowKeys(
  userId: string,
  rows: Array<{ txnDate: string; amountMinor: number; direction: "debit" | "credit" }>,
): Promise<Set<string>> {
  if (rows.length === 0) return new Set();
  const dates = rows.map((r) => r.txnDate).sort();
  const amounts = [...new Set(rows.map((r) => r.amountMinor))];
  const existing = await db
    .select({
      txnDate: transactions.txnDate,
      amountMinor: transactions.amountMinor,
      direction: transactions.direction,
    })
    .from(transactions)
    .where(
      and(
        eq(transactions.userId, userId),
        gte(transactions.txnDate, dates[0] as string),
        lte(transactions.txnDate, dates[dates.length - 1] as string),
        inArray(transactions.amountMinor, amounts),
      ),
    );
  return new Set(existing.map((r) => `${r.txnDate}|${r.amountMinor}|${r.direction}`));
}

/** Existing dedup hashes, used to badge duplicates in the review table. */
export async function findExistingHashes(userId: string, hashes: string[]): Promise<Set<string>> {
  if (hashes.length === 0) return new Set();
  const rows = await db
    .select({ dedupHash: transactions.dedupHash })
    .from(transactions)
    .where(and(eq(transactions.userId, userId), inArray(transactions.dedupHash, hashes)));
  return new Set(rows.map((r) => r.dedupHash));
}
