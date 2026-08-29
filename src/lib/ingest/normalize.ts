/**
 * Merchant normalization: collapse the noisy POS descriptor into a stable key
 * used for the dictionary, rules, recurring detection and top-merchant math.
 * "CAREEM*RIDE-8821 DUBAI ARE" → "CAREEM"
 */

const NOISE_PATTERNS: RegExp[] = [
  /\b(POS|PUR|PURCHASE|PMT|PAYMENT|TXN|TRX|REF|AUTH|SETTLEMENT)\b[.:#-]*\s*\d*/g,
  /\b\d{2}[/-]\d{2}(?:[/-]\d{2,4})?\b/g, // embedded dates
  /\b(?:CARD|CRD)\s*(?:NO\.?|#)?\s*[X*\d]{4,}\b/g, // card numbers
  /\b[X*]{2,}\d{2,4}\b/g, // masked digits
  /\b(AE|ARE|UAE|DUBAI|DXB|ABU DHABI|AUH|SHARJAH|SHJ)\b\s*$/g, // location tails
  /\b(AED|USD|EUR|GBP|SAR|INR|PKR)\b\s*[\d,.]*\s*$/g, // trailing currency amounts
  /[#*]\s*\d{3,}/g, // trailing reference numbers
];

export function normalizeMerchant(description: string): string {
  let value = description.toUpperCase();
  // unify separators before pattern matching
  value = value.replace(/[_*|]+/g, " ");
  for (const pattern of NOISE_PATTERNS) {
    value = value.replace(pattern, " ");
  }
  // drop long digit runs (terminal ids, invoice numbers) but keep short ones (e.g. "DU 101" stays)
  value = value.replace(/\b\d{5,}\b/g, " ");
  value = value.replace(/[^A-Z0-9&.' -]/g, " ");
  value = value.replace(/\s{2,}/g, " ").trim();
  // keep the leading, identity-carrying portion
  const words = value.split(" ").slice(0, 4);
  const result = words.join(" ").trim();
  return result.length > 0 ? result : description.toUpperCase().trim().slice(0, 40);
}

/** Title-case display name derived from the normalized key. */
export function displayMerchant(merchantNorm: string): string {
  return merchantNorm
    .toLowerCase()
    .split(" ")
    .map((word) =>
      word.length > 2 ? word.charAt(0).toUpperCase() + word.slice(1) : word.toUpperCase(),
    )
    .join(" ");
}
