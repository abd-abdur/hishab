import { describe, expect, it } from "vitest";

import {
  decryptJson,
  encryptJson,
  generateDekBytes,
  generateRecoveryCode,
  importDataKey,
  importTokenKey,
  merchantToken,
  normalizeRecoveryCode,
  unwrapDek,
  wrapDek,
} from "./crypto";

describe("envelope encryption", () => {
  it("wraps and unwraps a DEK with a password", async () => {
    const dek = generateDekBytes();
    const wrapped = await wrapDek(dek, "a-long-test-password-2026");
    const unwrapped = await unwrapDek(wrapped, "a-long-test-password-2026");
    expect(Array.from(unwrapped)).toEqual(Array.from(dek));
  });

  it("rejects the wrong secret", async () => {
    const wrapped = await wrapDek(generateDekBytes(), "correct-password-123");
    await expect(unwrapDek(wrapped, "wrong-password-1234")).rejects.toThrow();
  });

  it("two wraps of the same DEK are independent (unique salt/iv)", async () => {
    const dek = generateDekBytes();
    const a = await wrapDek(dek, "same-secret-here");
    const b = await wrapDek(dek, "same-secret-here");
    expect(a.salt).not.toEqual(b.salt);
    expect(a.iv).not.toEqual(b.iv);
    expect(a.ciphertext).not.toEqual(b.ciphertext);
  });

  it("round-trips JSON data through the data key", async () => {
    const key = await importDataKey(generateDekBytes());
    const value = { description: "POS TALABAT DUBAI", amountMinor: 4550, tags: ["food"] };
    const payload = await encryptJson(key, value);
    expect(payload.ciphertext).not.toContain("TALABAT");
    await expect(decryptJson(key, payload)).resolves.toEqual(value);
  });

  it("fails decryption with a different data key", async () => {
    const payload = await encryptJson(await importDataKey(generateDekBytes()), { a: 1 });
    await expect(decryptJson(await importDataKey(generateDekBytes()), payload)).rejects.toThrow();
  });

  it("recovery codes are well-formed and normalize from sloppy input", () => {
    const code = generateRecoveryCode();
    expect(code).toMatch(/^([A-Z2-9]{4}-){7}[A-Z2-9]{4}$/);
    expect(code).not.toMatch(/[ILOU01]/); // no ambiguous characters
    expect(normalizeRecoveryCode(code.toLowerCase().replaceAll("-", " "))).toBe(
      code.replaceAll("-", ""),
    );
    expect(generateRecoveryCode()).not.toEqual(generateRecoveryCode());
  });

  it("merchant tokens are deterministic per key and differ across keys", async () => {
    const dekA = generateDekBytes();
    const dekB = generateDekBytes();
    const keyA = await importTokenKey(dekA);
    const keyA2 = await importTokenKey(dekA);
    const keyB = await importTokenKey(dekB);
    const t1 = await merchantToken(keyA, "talabat");
    expect(t1).toMatch(/^[0-9a-f]{64}$/);
    expect(await merchantToken(keyA2, "talabat")).toBe(t1); // same DEK → same token
    expect(await merchantToken(keyA, "carrefour")).not.toBe(t1);
    expect(await merchantToken(keyB, "talabat")).not.toBe(t1); // different user → different token
  });

  it("a recovery-code wrap unlocks the same DEK", async () => {
    const dek = generateDekBytes();
    const code = generateRecoveryCode();
    const wrapped = await wrapDek(dek, normalizeRecoveryCode(code));
    // the user later types it lowercase with spaces
    const typed = normalizeRecoveryCode(code.toLowerCase().replaceAll("-", "  "));
    const unwrapped = await unwrapDek(wrapped, typed);
    expect(Array.from(unwrapped)).toEqual(Array.from(dek));
  });
});
