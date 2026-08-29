/**
 * Redact long account identifiers from statement text before it is sent to the
 * extraction model. The model only needs to transcribe transaction rows and
 * statement metadata; full account numbers, IBANs, and card numbers are not
 * required for that, so they never leave the server unmasked.
 *
 * Masking is deterministic (same input → same output) so dedup hashes computed
 * from redacted descriptions stay stable across repeated uploads. The last 4
 * characters are kept — enough for the model to report `accountNumberMasked`
 * and for users to recognize their own account.
 *
 * Note: scanned pages travel as JPEGs and cannot be redacted server-side; that
 * limitation is part of the transient-processing disclosure.
 */

/** Mask every character except the last 4 of the digits in `value`. */
function maskKeepLast4(value: string): string {
  const keep = 4;
  if (value.length <= keep) return value;
  return "•".repeat(value.length - keep) + value.slice(-keep);
}

// IBAN: two letters, two check digits, 11-30 alphanumerics (UAE: AE + 21 digits).
const IBAN_RE = /\b([A-Z]{2})(\d{2}[A-Z0-9]{11,30})\b/g;
// Card-style groups: 4x4 digits separated by spaces or dashes.
const CARD_RE = /\b(?:\d{4}[ -]){3}\d{4}\b/g;
// Standalone digit runs of 8+ — account numbers. Amounts are shorter or broken
// by separators; dates are 6-8 digits max, so 8 catches accounts like the
// 8-digit ones UAE banks issue while sparing ordinary numbers.
const DIGIT_RUN_RE = /\d{8,}/g;

export function redactAccountIdentifiers(text: string): string {
  return text
    .replace(IBAN_RE, (_, country: string, rest: string) => country + maskKeepLast4(rest))
    .replace(CARD_RE, (match) => maskKeepLast4(match.replace(/[ -]/g, "")))
    .replace(DIGIT_RUN_RE, (match) => maskKeepLast4(match));
}
