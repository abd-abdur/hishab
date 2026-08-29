import { and, eq, inArray, sql } from "drizzle-orm";

import { db } from "@/db/client";
import { recurringSeries, statements, transactions } from "@/db/schema";
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

  await db
    .update(statements)
    .set({ transactionCount: insertedCount, duplicateCount: skipped })
    .where(eq(statements.id, statementId));

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
      txnDate: transactions.txnDate,
      amountMinor: transactions.amountMinor,
      currency: transactions.currency,
    })
    .from(transactions)
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
 * category (with a floor of AED 100). A category needs at least four debits
 * before it has a "usual" — a lone hotel booking is not above anything.
 */
async function refreshAnomalyFlags(userId: string): Promise<void> {
  await db.execute(sql`
    WITH category_medians AS (
      SELECT category_id,
             percentile_cont(0.5) WITHIN GROUP (ORDER BY amount_minor) AS median_amount,
             count(*) AS sample_count
      FROM transactions
      WHERE user_id = ${userId} AND direction = 'debit'
      GROUP BY category_id
    )
    UPDATE transactions t
    SET is_anomaly = (
      t.direction = 'debit'
      AND m.sample_count >= 4
      AND t.amount_minor > GREATEST(m.median_amount * 3, 10000)
    )
    FROM category_medians m
    WHERE t.user_id = ${userId} AND t.category_id = m.category_id
  `);
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
