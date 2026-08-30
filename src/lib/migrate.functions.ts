import { createServerFn } from "@tanstack/react-start";
import { and, asc, eq, gt, notLike, sql } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db/client";
import { categoryRules, statements, transactions } from "@/db/schema";
import { authMiddleware } from "@/lib/auth-middleware";
import { refreshRecurringSeries } from "@/lib/ingest/persist.server";

/**
 * Legacy-row migration: rows written before field encryption shipped carry
 * plaintext text columns. The browser (the only place the keys exist) fetches
 * them in id-ordered batches, encrypts/tokenizes, and writes back through the
 * apply functions below.
 *
 * Safety properties, enforced server-side:
 * - Only the encrypted text columns are writable — never amounts, dates,
 *   direction, category, or dedup_hash (which stays plaintext-derived in both
 *   eras; recomputing it would break cross-era duplicate detection).
 * - Every write re-checks "not already migrated", so re-runs and races are
 *   no-ops rather than double encryption.
 * - Batches cursor on id, making a mid-run tab close resumable.
 */

const ENC_PREFIX = '{"v":1';
const CiphertextSchema = z.string().startsWith(ENC_PREFIX).max(8000);
const TokenSchema = z.string().regex(/^[0-9a-f]{64}$/);
const HEX64_SQL = "^[0-9a-f]{64}$";

export const getMigrationStatusFn = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const userId = context.userId;
    const [txns] = await db
      .select({ n: sql<string>`count(*)` })
      .from(transactions)
      .where(and(eq(transactions.userId, userId), notLike(transactions.description, `${ENC_PREFIX}%`)));
    const [stmts] = await db
      .select({ n: sql<string>`count(*)` })
      .from(statements)
      .where(and(eq(statements.userId, userId), notLike(statements.fileName, `${ENC_PREFIX}%`)));
    const [rules] = await db
      .select({ n: sql<string>`count(*)` })
      .from(categoryRules)
      .where(
        and(
          eq(categoryRules.userId, userId),
          eq(categoryRules.matchType, "merchant_exact"),
          sql`${categoryRules.pattern} !~ ${HEX64_SQL}`,
        ),
      );
    return {
      legacyTransactions: Number(txns?.n ?? 0),
      legacyStatements: Number(stmts?.n ?? 0),
      legacyRules: Number(rules?.n ?? 0),
    };
  });

export const getLegacyTransactionsFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .inputValidator(z.object({ cursor: z.string().optional(), limit: z.number().int().min(1).max(200).default(100) }))
  .handler(async ({ data, context }) => {
    return db
      .select({
        id: transactions.id,
        description: transactions.description,
        merchantNorm: transactions.merchantNorm,
        merchantDisplay: transactions.merchantDisplay,
      })
      .from(transactions)
      .where(
        and(
          eq(transactions.userId, context.userId),
          notLike(transactions.description, `${ENC_PREFIX}%`),
          ...(data.cursor ? [gt(transactions.id, data.cursor)] : []),
        ),
      )
      .orderBy(asc(transactions.id))
      .limit(data.limit);
  });

export const applyMigratedTransactionsFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .inputValidator(
    z.object({
      rows: z
        .array(
          z.object({
            id: z.string().min(1),
            description: CiphertextSchema,
            merchantNorm: TokenSchema,
            merchantDisplay: CiphertextSchema,
          }),
        )
        .min(1)
        .max(200),
    }),
  )
  .handler(async ({ data, context }) => {
    let updated = 0;
    for (const row of data.rows) {
      const result = await db
        .update(transactions)
        .set({
          description: row.description,
          merchantNorm: row.merchantNorm,
          merchantDisplay: row.merchantDisplay,
        })
        .where(
          and(
            eq(transactions.id, row.id),
            eq(transactions.userId, context.userId),
            notLike(transactions.description, `${ENC_PREFIX}%`),
          ),
        )
        .returning({ id: transactions.id });
      updated += result.length;
    }
    return { updated };
  });

export const getLegacyStatementsFn = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    return db
      .select({
        id: statements.id,
        fileName: statements.fileName,
        bankName: statements.bankName,
        accountNumberMasked: statements.accountNumberMasked,
      })
      .from(statements)
      .where(and(eq(statements.userId, context.userId), notLike(statements.fileName, `${ENC_PREFIX}%`)))
      .orderBy(asc(statements.id))
      .limit(200);
  });

export const applyMigratedStatementsFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .inputValidator(
    z.object({
      rows: z
        .array(
          z.object({
            id: z.string().min(1),
            fileName: CiphertextSchema,
            bankName: CiphertextSchema.nullable(),
            accountNumberMasked: CiphertextSchema.nullable(),
          }),
        )
        .min(1)
        .max(200),
    }),
  )
  .handler(async ({ data, context }) => {
    let updated = 0;
    for (const row of data.rows) {
      const result = await db
        .update(statements)
        .set({
          fileName: row.fileName,
          bankName: row.bankName,
          accountNumberMasked: row.accountNumberMasked,
        })
        .where(
          and(
            eq(statements.id, row.id),
            eq(statements.userId, context.userId),
            notLike(statements.fileName, `${ENC_PREFIX}%`),
          ),
        )
        .returning({ id: statements.id });
      updated += result.length;
    }
    return { updated };
  });

export const getLegacyRulesFn = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    return db
      .select({ id: categoryRules.id, pattern: categoryRules.pattern })
      .from(categoryRules)
      .where(
        and(
          eq(categoryRules.userId, context.userId),
          eq(categoryRules.matchType, "merchant_exact"),
          sql`${categoryRules.pattern} !~ ${HEX64_SQL}`,
        ),
      )
      .limit(500);
  });

export const applyMigratedRulesFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .inputValidator(
    z.object({
      rows: z
        .array(
          z.object({
            id: z.string().min(1),
            pattern: TokenSchema,
            patternDisplay: CiphertextSchema,
          }),
        )
        .min(1)
        .max(500),
    }),
  )
  .handler(async ({ data, context }) => {
    let updated = 0;
    for (const row of data.rows) {
      const result = await db
        .update(categoryRules)
        .set({ pattern: row.pattern, patternDisplay: row.patternDisplay })
        .where(
          and(
            eq(categoryRules.id, row.id),
            eq(categoryRules.userId, context.userId),
            sql`${categoryRules.pattern} !~ ${HEX64_SQL}`,
          ),
        )
        .returning({ id: categoryRules.id });
      updated += result.length;
    }
    return { updated };
  });

/** After row migration: regenerate recurring series from the migrated rows. */
export const finishLegacyMigrationFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    await refreshRecurringSeries(context.userId);
    return { ok: true };
  });
