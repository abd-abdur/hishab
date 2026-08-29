import {
  decryptJson,
  encryptJson,
  merchantToken,
  type EncryptedPayload,
} from "@/lib/crypto";
import type { UsableKeys } from "@/lib/key-store";

/**
 * Field-level encryption at the data boundary. Sensitive text (descriptions,
 * merchant names, file names, account numbers) is encrypted in the browser
 * before commit and decrypted after fetch; the numeric skeleton (amounts,
 * dates, direction, category) stays plaintext so server aggregates keep
 * working. Merchant identity is preserved for grouping via deterministic
 * HMAC tokens.
 *
 * Values written before encryption shipped are plain strings; readers treat
 * anything that doesn't parse as an EncryptedPayload as legacy plaintext.
 */

/** Shown in place of encrypted values when this browser holds no key. */
export const LOCKED_VALUE = "•• locked ••";

export function isEncryptedValue(value: string): boolean {
  if (!value.startsWith('{"v":1')) return false;
  try {
    const parsed = JSON.parse(value) as Partial<EncryptedPayload>;
    return parsed.v === 1 && typeof parsed.iv === "string" && typeof parsed.ciphertext === "string";
  } catch {
    return false;
  }
}

export async function encryptValue(keys: UsableKeys, value: string): Promise<string> {
  return JSON.stringify(await encryptJson(keys.dataKey, value));
}

/** Decrypt when encrypted; pass legacy plaintext through; never throw. */
export async function decryptValue(keys: UsableKeys | null, value: string): Promise<string> {
  if (!isEncryptedValue(value)) return value;
  if (!keys) return LOCKED_VALUE;
  try {
    return await decryptJson<string>(keys.dataKey, JSON.parse(value) as EncryptedPayload);
  } catch {
    return LOCKED_VALUE;
  }
}

/** Decrypt the named string fields of each row, returning new row objects. */
export async function decryptRows<T extends Record<string, unknown>>(
  keys: UsableKeys | null,
  rows: T[],
  fields: ReadonlyArray<keyof T & string>,
): Promise<T[]> {
  return Promise.all(
    rows.map(async (row) => {
      const patch: Record<string, string> = {};
      for (const field of fields) {
        const value = row[field];
        if (typeof value === "string" && value.length > 0) {
          patch[field] = await decryptValue(keys, value);
        }
      }
      return { ...row, ...patch };
    }),
  );
}

const TOKEN_RE = /^[0-9a-f]{64}$/;

/** True for HMAC merchant tokens (as opposed to legacy plaintext merchant_norm). */
export function isMerchantToken(value: string): boolean {
  return TOKEN_RE.test(value);
}

export async function tokenizeMerchant(keys: UsableKeys, merchantNorm: string): Promise<string> {
  return merchantToken(keys.tokenKey, merchantNorm);
}

type CommitDraftStatement = {
  fileName: string;
  bankName: string | null;
  accountNumberMasked: string | null;
  [key: string]: unknown;
};

type CommitDraftRow = {
  description: string;
  merchantNorm: string;
  merchantDisplay: string;
  [key: string]: unknown;
};

/**
 * The commit-time transform: encrypt the identifying text of a reviewed draft
 * and tokenize merchant identity. Everything else (amounts, dates, hashes,
 * categories) passes through untouched.
 */
export async function encryptDraftForCommit<
  S extends CommitDraftStatement,
  R extends CommitDraftRow,
>(keys: UsableKeys, statement: S, rows: R[]): Promise<{ statement: S; rows: R[] }> {
  const [fileName, bankName, accountNumberMasked] = await Promise.all([
    encryptValue(keys, statement.fileName),
    statement.bankName ? encryptValue(keys, statement.bankName) : Promise.resolve(null),
    statement.accountNumberMasked
      ? encryptValue(keys, statement.accountNumberMasked)
      : Promise.resolve(null),
  ]);
  const encryptedRows = await Promise.all(
    rows.map(async (row) => ({
      ...row,
      description: await encryptValue(keys, row.description),
      merchantNorm: await tokenizeMerchant(keys, row.merchantNorm),
      merchantDisplay: await encryptValue(keys, row.merchantDisplay),
    })),
  );
  return {
    statement: { ...statement, fileName, bankName, accountNumberMasked },
    rows: encryptedRows,
  };
}
