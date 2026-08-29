import { describe, expect, it } from "vitest";

import { generateDekBytes, importDataKey, importTokenKey } from "./crypto";
import {
  decryptRows,
  decryptValue,
  encryptDraftForCommit,
  isEncryptedValue,
  isMerchantToken,
  LOCKED_VALUE,
} from "./enc-data";
import type { UsableKeys } from "./key-store";

async function makeKeys(): Promise<UsableKeys> {
  const dek = generateDekBytes();
  return { dataKey: await importDataKey(dek), tokenKey: await importTokenKey(dek) };
}

const statement = {
  fileName: "Credit Statement AUGUST 2026.pdf",
  fileType: "pdf",
  bankName: "Wio",
  accountNumberMasked: "••••4367",
  currency: "AED",
  reconciliationStatus: "reconciled",
};

const rows = [
  {
    txnDate: "2026-08-01",
    description: "POS CARREFOUR DUBAI MALL",
    merchantNorm: "carrefour",
    merchantDisplay: "Carrefour",
    amountMinor: 12050,
    direction: "debit" as const,
    dedupHash: "a".repeat(64),
  },
  {
    txnDate: "2026-08-05",
    description: "POS CARREFOUR DUBAI MALL 2",
    merchantNorm: "carrefour",
    merchantDisplay: "Carrefour",
    amountMinor: 8925,
    direction: "debit" as const,
    dedupHash: "b".repeat(64),
  },
];

describe("commit-time encryption round trip", () => {
  it("encrypts identifying text, tokenizes merchants, preserves the skeleton", async () => {
    const keys = await makeKeys();
    const out = await encryptDraftForCommit(keys, statement, rows);

    // identifying text became ciphertext
    expect(isEncryptedValue(out.statement.fileName)).toBe(true);
    expect(isEncryptedValue(out.statement.bankName as string)).toBe(true);
    expect(isEncryptedValue(out.rows[0]!.description)).toBe(true);
    expect(out.rows[0]!.description).not.toContain("CARREFOUR");

    // merchant identity became a deterministic token — same merchant, same token
    expect(isMerchantToken(out.rows[0]!.merchantNorm)).toBe(true);
    expect(out.rows[0]!.merchantNorm).toBe(out.rows[1]!.merchantNorm);

    // the numeric skeleton the server aggregates over is untouched
    expect(out.rows[0]!.amountMinor).toBe(12050);
    expect(out.rows[0]!.txnDate).toBe("2026-08-01");
    expect(out.rows[0]!.dedupHash).toBe("a".repeat(64));
    expect(out.statement.currency).toBe("AED");

    // and the read path restores the text
    const restored = await decryptRows(keys, out.rows, ["description", "merchantDisplay"]);
    expect(restored[0]!.description).toBe("POS CARREFOUR DUBAI MALL");
    expect(restored[0]!.merchantDisplay).toBe("Carrefour");
  });

  it("legacy plaintext passes through; missing keys show the locked marker", async () => {
    const keys = await makeKeys();
    await expect(decryptValue(keys, "plain old text")).resolves.toBe("plain old text");
    const out = await encryptDraftForCommit(keys, statement, rows);
    await expect(decryptValue(null, out.rows[0]!.description)).resolves.toBe(LOCKED_VALUE);
    const other = await makeKeys();
    await expect(decryptValue(other, out.rows[0]!.description)).resolves.toBe(LOCKED_VALUE);
  });
});
