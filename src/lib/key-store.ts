import {
  generateDekBytes,
  generateRecoveryCode,
  importDataKey,
  importTokenKey,
  normalizeRecoveryCode,
  unwrapDek,
  wrapDek,
  type WrappedKey,
} from "@/lib/crypto";
import { createMyKeysFn, getMyKeysFn, rewrapMyKeysFn } from "@/lib/keys.functions";

/**
 * Browser-side key ceremony. The unwrapped data key lives only here — as a
 * non-extractable CryptoKey in IndexedDB, which scripts can use but never
 * export. The server never sees it.
 *
 * Every entry point is fail-open for now: while no columns are encrypted yet,
 * a failed ceremony must never block someone out of their data. When column
 * encryption lands, the app-level gate flips to fail-closed.
 */

const DB_NAME = "hishab-keys";
const STORE = "data-keys";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error as Error);
  });
}

async function idbPut(key: string, value: unknown): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error as Error);
  });
  db.close();
}

async function idbGet<T>(key: string): Promise<T | undefined> {
  const db = await openDb();
  const value = await new Promise<T | undefined>((resolve, reject) => {
    const request = db.transaction(STORE, "readonly").objectStore(STORE).get(key);
    request.onsuccess = () => resolve(request.result as T | undefined);
    request.onerror = () => reject(request.error as Error);
  });
  db.close();
  return value;
}

async function idbClear(): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error as Error);
  });
  db.close();
}

export type UsableKeys = {
  /** AES-GCM key for encrypting/decrypting field values */
  dataKey: CryptoKey;
  /** HMAC key for deterministic merchant tokens */
  tokenKey: CryptoKey;
};

/** Derive both usable keys from raw DEK bytes and persist them (non-extractable). */
async function storeUsableKeys(userId: string, dekBytes: Uint8Array): Promise<void> {
  const [dataKey, tokenKey] = await Promise.all([
    importDataKey(dekBytes),
    importTokenKey(dekBytes),
  ]);
  await idbPut(`dek:${userId}`, dataKey);
  await idbPut(`tok:${userId}`, tokenKey);
}

/**
 * The stored usable keys for this user, or null when this browser hasn't
 * unlocked them (fresh browser, cleared storage, or a pre-token unlock —
 * a re-login refreshes both).
 */
export async function getStoredKeys(userId: string): Promise<UsableKeys | null> {
  try {
    const [dataKey, tokenKey] = await Promise.all([
      idbGet<CryptoKey>(`dek:${userId}`),
      idbGet<CryptoKey>(`tok:${userId}`),
    ]);
    return dataKey && tokenKey ? { dataKey, tokenKey } : null;
  } catch {
    return null;
  }
}

/** Remove all stored keys (sign-out of a shared machine). */
export async function clearStoredKeys(): Promise<void> {
  try {
    await idbClear();
  } catch {
    // nothing to clear (private mode, blocked storage)
  }
}

export type UnlockResult =
  | { status: "unlocked" }
  | { status: "created"; recoveryCode: string }
  | { status: "wrong_secret" }
  | { status: "error" };

/**
 * Run after a successful sign-in or signup, while the password is still in
 * hand. Provisions keys on first use (returning the one-time recovery code to
 * show the user), otherwise unwraps and stores the data key. "wrong_secret"
 * means the password no longer matches the wrapper — a reset happened — and
 * the recovery path must re-wrap.
 */
export async function unlockWithPassword(userId: string, password: string): Promise<UnlockResult> {
  try {
    const existing = await getMyKeysFn();
    if (!existing) {
      const dek = generateDekBytes();
      const recoveryCode = generateRecoveryCode();
      const [wrappedDekPassword, wrappedDekRecovery] = await Promise.all([
        wrapDek(dek, password),
        wrapDek(dek, normalizeRecoveryCode(recoveryCode)),
      ]);
      const { created } = await createMyKeysFn({
        data: { wrappedDekPassword, wrappedDekRecovery },
      });
      if (!created) {
        // Raced with another tab that provisioned first; unlock with theirs.
        return unlockWithPassword(userId, password);
      }
      await storeUsableKeys(userId, dek);
      return { status: "created", recoveryCode };
    }

    const wrapped = JSON.parse(existing.wrappedDekPassword) as WrappedKey;
    let dek: Uint8Array;
    try {
      dek = await unwrapDek(wrapped, password);
    } catch {
      return { status: "wrong_secret" };
    }
    await storeUsableKeys(userId, dek);
    return { status: "unlocked" };
  } catch {
    return { status: "error" };
  }
}

/**
 * Recovery path: unwrap with the recovery code, re-wrap under the current
 * password, and issue a fresh recovery code (the old one is spent — it was
 * typed, possibly on a shared screen).
 */
export async function unlockWithRecoveryCode(
  userId: string,
  recoveryCode: string,
  currentPassword: string,
): Promise<UnlockResult> {
  try {
    const existing = await getMyKeysFn();
    if (!existing) return { status: "error" };
    const wrapped = JSON.parse(existing.wrappedDekRecovery) as WrappedKey;
    let dek: Uint8Array;
    try {
      dek = await unwrapDek(wrapped, normalizeRecoveryCode(recoveryCode));
    } catch {
      return { status: "wrong_secret" };
    }
    const freshCode = generateRecoveryCode();
    const [wrappedDekPassword, wrappedDekRecovery] = await Promise.all([
      wrapDek(dek, currentPassword),
      wrapDek(dek, normalizeRecoveryCode(freshCode)),
    ]);
    await rewrapMyKeysFn({ data: { wrappedDekPassword, wrappedDekRecovery } });
    await storeUsableKeys(userId, dek);
    return { status: "created", recoveryCode: freshCode };
  } catch {
    return { status: "error" };
  }
}
