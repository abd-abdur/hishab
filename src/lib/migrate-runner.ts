import { encryptValue, tokenizeMerchant } from "@/lib/enc-data";
import { getStoredKeys } from "@/lib/key-store";
import {
  applyMigratedRulesFn,
  applyMigratedStatementsFn,
  applyMigratedTransactionsFn,
  finishLegacyMigrationFn,
  getLegacyRulesFn,
  getLegacyStatementsFn,
  getLegacyTransactionsFn,
  getMigrationStatusFn,
} from "@/lib/migrate.functions";

export type MigrationProgress = { done: number; total: number };

export type MigrationResult =
  | { status: "done"; migrated: number }
  | { status: "nothing_to_do" }
  | { status: "locked" }
  | { status: "error"; migrated: number };

/**
 * One-time re-encryption of pre-encryption rows, running entirely in the
 * browser because only it holds the keys. Idempotent and resumable: the
 * server hands out only still-plaintext rows and refuses writes to rows that
 * are already ciphertext, so interrupting and re-running is always safe.
 */
export async function runLegacyMigration(
  userId: string,
  onProgress?: (progress: MigrationProgress) => void,
): Promise<MigrationResult> {
  const keys = await getStoredKeys(userId);
  if (!keys) return { status: "locked" };

  const status = await getMigrationStatusFn();
  const total = status.legacyTransactions + status.legacyStatements + status.legacyRules;
  if (total === 0) return { status: "nothing_to_do" };

  let done = 0;
  const report = () => onProgress?.({ done, total });
  report();

  try {
    let cursor: string | undefined;
    for (;;) {
      const batch = await getLegacyTransactionsFn({ data: { cursor, limit: 100 } });
      if (batch.length === 0) break;
      const rows = await Promise.all(
        batch.map(async (row) => ({
          id: row.id,
          description: await encryptValue(keys, row.description),
          merchantNorm: await tokenizeMerchant(keys, row.merchantNorm),
          merchantDisplay: await encryptValue(keys, row.merchantDisplay),
        })),
      );
      const { updated } = await applyMigratedTransactionsFn({ data: { rows } });
      done += updated;
      cursor = batch[batch.length - 1]!.id;
      report();
    }

    const legacyStatements = await getLegacyStatementsFn();
    if (legacyStatements.length > 0) {
      const rows = await Promise.all(
        legacyStatements.map(async (s) => ({
          id: s.id,
          fileName: await encryptValue(keys, s.fileName),
          bankName: s.bankName ? await encryptValue(keys, s.bankName) : null,
          accountNumberMasked: s.accountNumberMasked
            ? await encryptValue(keys, s.accountNumberMasked)
            : null,
        })),
      );
      const { updated } = await applyMigratedStatementsFn({ data: { rows } });
      done += updated;
      report();
    }

    const legacyRules = await getLegacyRulesFn();
    if (legacyRules.length > 0) {
      const rows = await Promise.all(
        legacyRules.map(async (r) => ({
          id: r.id,
          pattern: await tokenizeMerchant(keys, r.pattern),
          // the plaintext pattern IS the readable merchant name for legacy rules
          patternDisplay: await encryptValue(keys, r.pattern),
        })),
      );
      const { updated } = await applyMigratedRulesFn({ data: { rows } });
      done += updated;
      report();
    }

    await finishLegacyMigrationFn();
    return { status: "done", migrated: done };
  } catch {
    return { status: "error", migrated: done };
  }
}
