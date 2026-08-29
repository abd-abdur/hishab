/**
 * Envelope encryption for zero-knowledge storage. Everything here runs in the
 * user's browser (WebCrypto; node's webcrypto in tests) — the server only ever
 * sees wrapped (encrypted) key material and ciphertext.
 *
 * Key model:
 * - DEK (data encryption key): random AES-256-GCM key, generated at signup,
 *   encrypts all sensitive columns. Never leaves the browser unwrapped.
 * - KEK (key encryption key): derived from the user's password with
 *   PBKDF2-SHA256, wraps the DEK. A second wrap uses a one-time recovery code,
 *   so a forgotten password doesn't orphan the data.
 *
 * The server stores only the two wrapped blobs. Losing both the password and
 * the recovery code makes the data unrecoverable — by design, for everyone.
 */

const subtle = globalThis.crypto.subtle;

/** OWASP-recommended order of magnitude for PBKDF2-SHA256 (2023+). */
export const KDF_ITERATIONS = 600_000;

export type WrappedKey = {
  v: 1;
  kdf: "PBKDF2-SHA256";
  iterations: number;
  /** base64 */
  salt: string;
  /** base64 */
  iv: string;
  /** base64 — AES-GCM ciphertext of the raw DEK bytes */
  ciphertext: string;
};

export type EncryptedPayload = {
  v: 1;
  /** base64 */
  iv: string;
  /** base64 */
  ciphertext: string;
};

/* ------------------------------ encoding ------------------------------ */

export function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

export function fromBase64(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/* ------------------------------ key material ------------------------------ */

/** Generate a fresh 256-bit data encryption key (raw bytes). */
export function generateDekBytes(): Uint8Array {
  return globalThis.crypto.getRandomValues(new Uint8Array(32));
}

/**
 * One-time recovery code: 160 bits, Crockford-style base32 without ambiguous
 * characters, grouped for humans: XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX.
 */
const RECOVERY_ALPHABET = "ABCDEFGHJKMNPQRSTVWXYZ23456789";

export function generateRecoveryCode(): string {
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(32));
  let code = "";
  for (let i = 0; i < 32; i++) {
    code += RECOVERY_ALPHABET[(bytes[i] as number) % RECOVERY_ALPHABET.length];
  }
  return (code.match(/.{4}/g) as string[]).join("-");
}

/** Uppercases and strips separators/whitespace so typed codes compare cleanly. */
export function normalizeRecoveryCode(input: string): string {
  return input.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/* ------------------------------ wrapping ------------------------------ */

async function deriveKek(secret: string, salt: Uint8Array, iterations: number): Promise<CryptoKey> {
  const material = await subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  return subtle.deriveKey(
    { name: "PBKDF2", hash: "SHA-256", salt: salt as BufferSource, iterations },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

/** Wrap raw DEK bytes with a secret (password or normalized recovery code). */
export async function wrapDek(dekBytes: Uint8Array, secret: string): Promise<WrappedKey> {
  const salt = globalThis.crypto.getRandomValues(new Uint8Array(16));
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
  const kek = await deriveKek(secret, salt, KDF_ITERATIONS);
  const ciphertext = await subtle.encrypt(
    { name: "AES-GCM", iv: iv as BufferSource },
    kek,
    dekBytes as BufferSource,
  );
  return {
    v: 1,
    kdf: "PBKDF2-SHA256",
    iterations: KDF_ITERATIONS,
    salt: toBase64(salt),
    iv: toBase64(iv),
    ciphertext: toBase64(new Uint8Array(ciphertext)),
  };
}

/** Unwrap a DEK. Throws (AES-GCM auth failure) when the secret is wrong. */
export async function unwrapDek(wrapped: WrappedKey, secret: string): Promise<Uint8Array> {
  const kek = await deriveKek(secret, fromBase64(wrapped.salt), wrapped.iterations);
  const dek = await subtle.decrypt(
    { name: "AES-GCM", iv: fromBase64(wrapped.iv) as BufferSource },
    kek,
    fromBase64(wrapped.ciphertext) as BufferSource,
  );
  return new Uint8Array(dek);
}

/* ------------------------------ data encryption ------------------------------ */

/* ------------------------------ merchant tokens ------------------------------ */

/**
 * Deterministic pseudonyms for merchant grouping: equal merchants map to equal
 * tokens, so server-side GROUP BY / joins / rule matching keep working over
 * data whose readable text is encrypted. Derived from the DEK via HKDF so the
 * token key never needs separate storage or wrapping.
 */
export async function importTokenKey(dekBytes: Uint8Array): Promise<CryptoKey> {
  const hkdfKey = await subtle.importKey("raw", dekBytes as BufferSource, "HKDF", false, [
    "deriveKey",
  ]);
  return subtle.deriveKey(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: new Uint8Array(32) as BufferSource,
      info: new TextEncoder().encode("hishab-merchant-token-v1"),
    },
    hkdfKey,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
}

/** 64-hex deterministic token for a normalized merchant string. */
export async function merchantToken(tokenKey: CryptoKey, merchantNorm: string): Promise<string> {
  const mac = await subtle.sign(
    "HMAC",
    tokenKey,
    new TextEncoder().encode(merchantNorm) as BufferSource,
  );
  return Array.from(new Uint8Array(mac))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Import raw DEK bytes as a usable AES-GCM key. `extractable: false` means
 * even script running in the page can use but never read the key again —
 * the form we keep in IndexedDB.
 */
export async function importDataKey(dekBytes: Uint8Array, extractable = false): Promise<CryptoKey> {
  return subtle.importKey("raw", dekBytes as BufferSource, { name: "AES-GCM" }, extractable, [
    "encrypt",
    "decrypt",
  ]);
}

/** Encrypt any JSON-serializable value with the data key. */
export async function encryptJson(dataKey: CryptoKey, value: unknown): Promise<EncryptedPayload> {
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
  const plaintext = new TextEncoder().encode(JSON.stringify(value));
  const ciphertext = await subtle.encrypt(
    { name: "AES-GCM", iv: iv as BufferSource },
    dataKey,
    plaintext as BufferSource,
  );
  return { v: 1, iv: toBase64(iv), ciphertext: toBase64(new Uint8Array(ciphertext)) };
}

/** Decrypt a payload produced by encryptJson. Throws on tampering/wrong key. */
export async function decryptJson<T>(dataKey: CryptoKey, payload: EncryptedPayload): Promise<T> {
  const plaintext = await subtle.decrypt(
    { name: "AES-GCM", iv: fromBase64(payload.iv) as BufferSource },
    dataKey,
    fromBase64(payload.ciphertext) as BufferSource,
  );
  return JSON.parse(new TextDecoder().decode(plaintext)) as T;
}
