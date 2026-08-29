/**
 * All amounts are stored and computed as integer minor units (fils for AED).
 * Formatting is the only place a decimal representation exists.
 */

const formatterCache = new Map<string, Intl.NumberFormat>();

function formatterFor(currency: string): Intl.NumberFormat {
  let fmt = formatterCache.get(currency);
  if (!fmt) {
    fmt = new Intl.NumberFormat("en-AE", {
      style: "currency",
      currency,
      currencyDisplay: "code",
    });
    formatterCache.set(currency, fmt);
  }
  return fmt;
}

/** 100 for AED/USD, 1000 for KWD/BHD, 1 for JPY — derived from Intl, cached. */
export function minorUnitFactor(currency: string): number {
  const digits = formatterFor(currency).resolvedOptions().maximumFractionDigits ?? 2;
  return 10 ** digits;
}

export function toMinorUnits(major: number, currency = "AED"): number {
  return Math.round(major * minorUnitFactor(currency));
}

export function toMajorUnits(minor: number, currency = "AED"): number {
  return minor / minorUnitFactor(currency);
}

/** "AED 1,240.50" — always en-AE, currency as code, true amounts only. */
export function formatMoney(minorUnits: number, currency = "AED"): string {
  return formatterFor(currency).format(toMajorUnits(minorUnits, currency));
}

/**
 * Signed display for transaction lists: debits get a true minus (U+2212),
 * credits an explicit plus.
 */
export function formatSignedMoney(
  minorUnits: number,
  direction: "debit" | "credit",
  currency = "AED",
): string {
  const base = formatMoney(Math.abs(minorUnits), currency);
  return direction === "debit" ? `−${base}` : `+${base}`;
}

/** Compact figure for stat tiles: "AED 12.4k" above 10,000, full below. */
export function formatMoneyCompact(minorUnits: number, currency = "AED"): string {
  const major = toMajorUnits(Math.abs(minorUnits), currency);
  if (major >= 10_000) {
    const compact = new Intl.NumberFormat("en-AE", {
      notation: "compact",
      maximumFractionDigits: 1,
    }).format(major);
    return `${currency} ${compact}`;
  }
  return formatMoney(Math.abs(minorUnits), currency);
}

const dateFormatter = new Intl.DateTimeFormat("en-AE"); // DD/MM/YYYY
const dateFormatterLong = new Intl.DateTimeFormat("en-AE", {
  day: "numeric",
  month: "short",
  year: "numeric",
});

/** Accepts a Date or an ISO yyyy-mm-dd string (parsed as local, not UTC-shifted). */
export function parseISODateLocal(iso: string): Date {
  const parts = iso.split("-").map(Number);
  return new Date(parts[0] ?? 1970, (parts[1] ?? 1) - 1, parts[2] ?? 1);
}

export function formatDate(date: Date | string): string {
  return dateFormatter.format(typeof date === "string" ? parseISODateLocal(date) : date);
}

/** "18 Aug 2026" for headers and freshness notes. */
export function formatDateLong(date: Date | string): string {
  return dateFormatterLong.format(typeof date === "string" ? parseISODateLocal(date) : date);
}

export function toISODate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
