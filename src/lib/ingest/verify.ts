import { minorUnitFactor, toISODate } from "@/lib/money";
import { displayMerchant, normalizeMerchant } from "./normalize";
import type { ExtractBatch, RawTransaction } from "./extract-schema";

/**
 * Deterministic layer between model transcription and the database:
 * date disambiguation, integer-minor-unit conversion, running-balance
 * validation and opening/closing reconciliation. No model calls here.
 */

export type VerifiedTransaction = {
  txnDate: string; // ISO yyyy-mm-dd
  description: string;
  merchantNorm: string;
  merchantDisplay: string;
  amountMinor: number;
  direction: "debit" | "credit";
  runningBalanceMinor: number | null;
  confidence: number;
};

export type VerifiedStatement = {
  bankName: string | null;
  currency: string;
  accountNumberMasked: string | null;
  periodStart: string | null;
  periodEnd: string | null;
  openingBalanceMinor: number | null;
  closingBalanceMinor: number | null;
  reconciliationStatus: "reconciled" | "mismatch" | "no_balances";
  reconciliationDeltaMinor: number | null;
  transactions: VerifiedTransaction[];
};

const MONTHS: Record<string, number> = {
  jan: 1,
  feb: 2,
  mar: 3,
  apr: 4,
  may: 5,
  jun: 6,
  jul: 7,
  aug: 8,
  sep: 9,
  sept: 9,
  oct: 10,
  nov: 11,
  dec: 12,
};

type DateParts = { day: number; month: number; year: number | null };

/** Parse one printed date under a day/month order hypothesis. */
function parseDateToken(raw: string, order: "DMY" | "MDY" | "YMD"): DateParts | null {
  const value = raw.trim();

  // Textual month: "3 Jul 2026", "Jul 3, 2026", "03-JUL-26"
  const textual = value.match(/^(\d{1,4})[\s\-/.]*([A-Za-z]{3,9})[\s\-/.,]*(\d{1,4})?$/);
  const textualRev = value.match(/^([A-Za-z]{3,9})[\s\-/.,]*(\d{1,2})[\s\-/.,]*(\d{2,4})?$/);
  if (textual || textualRev) {
    const m = textual ?? textualRev;
    if (!m) return null;
    const monthName = (textual ? m[2] : m[1])
      ?.toLowerCase()
      .slice(0, 4)
      .replace(/[^a-z]/g, "");
    const month = MONTHS[monthName?.slice(0, 3) ?? ""] ?? MONTHS[monthName ?? ""];
    if (!month) return null;
    const dayStr = textual ? m[1] : m[2];
    const yearStr = m[3];
    const day = Number(dayStr);
    if (!Number.isInteger(day) || day < 1 || day > 31) return null;
    return { day, month, year: yearStr ? normalizeYear(Number(yearStr)) : null };
  }

  // Numeric: 03/07/2026, 2026-07-03, 03.07.26, 03/07
  const nums = value.match(/\d+/g);
  if (!nums || nums.length < 2) return null;
  const parts = nums.map(Number);

  if ((parts[0] ?? 0) > 999) {
    // leading 4-digit year → YMD regardless of hypothesis
    return { year: parts[0] ?? null, month: parts[1] ?? 1, day: parts[2] ?? 1 };
  }

  const a = parts[0] ?? 1;
  const b = parts[1] ?? 1;
  const y = parts.length > 2 ? normalizeYear(parts[2] ?? 0) : null;
  if (order === "MDY") return { day: b, month: a, year: y };
  if (order === "YMD") return { day: b, month: a, year: y }; // 2-digit YMD is vanishingly rare; treat as MDY-ish
  return { day: a, month: b, year: y };
}

function normalizeYear(year: number): number {
  if (year >= 100) return year;
  return year >= 70 ? 1900 + year : 2000 + year;
}

/**
 * Decide the day/month order for the whole statement:
 * 1. any token with first number > 12 → DMY; second > 12 → MDY (a single
 *    statement never mixes orders);
 * 2. otherwise trust the model's layout guess;
 * 3. otherwise default DMY (UAE convention).
 */
export function resolveDateOrder(
  rawDates: string[],
  modelGuess: "DMY" | "MDY" | "YMD" | "unknown",
): "DMY" | "MDY" | "YMD" {
  for (const raw of rawDates) {
    const nums = raw.match(/\d+/g)?.map(Number);
    if (!nums || nums.length < 2) continue;
    if ((nums[0] ?? 0) > 999) return "YMD";
    if ((nums[0] ?? 0) > 12 && (nums[0] ?? 0) <= 31) return "DMY";
    if ((nums[1] ?? 0) > 12 && (nums[1] ?? 0) <= 31) return "MDY";
  }
  if (modelGuess !== "unknown") return modelGuess;
  return "DMY";
}

/** Fill missing years from the statement period (or today), handling Dec→Jan spans. */
function resolveYear(parts: DateParts, periodStart: Date | null, periodEnd: Date | null): number {
  if (parts.year) return parts.year;
  const anchor = periodEnd ?? periodStart;
  if (!anchor) return new Date().getFullYear();
  const anchorYear = anchor.getFullYear();
  if (periodStart && periodEnd && periodStart.getFullYear() !== periodEnd.getFullYear()) {
    // span crosses new year: months near December belong to the start year
    return parts.month >= periodStart.getMonth() + 1
      ? periodStart.getFullYear()
      : periodEnd.getFullYear();
  }
  return anchorYear;
}

function toMinor(amount: number, factor: number): number {
  return Math.round(amount * factor);
}

export function verifyStatement(batch: ExtractBatch): VerifiedStatement {
  const meta = batch.statement;
  const currency = (meta.currency ?? "AED").toUpperCase().slice(0, 3);
  const factor = minorUnitFactor(currency);

  const order = resolveDateOrder(
    batch.transactions.map((t) => t.date),
    meta.dateFormatGuess,
  );

  let periodStart = meta.periodStart
    ? datePartsToDate(parseDateToken(meta.periodStart, order))
    : null;
  let periodEnd = meta.periodEnd ? datePartsToDate(parseDateToken(meta.periodEnd, order)) : null;

  const transactions: VerifiedTransaction[] = [];
  for (const raw of batch.transactions) {
    const verified = verifyRow(raw, order, factor, periodStart, periodEnd);
    if (verified) transactions.push(verified);
  }

  // A period that doesn't overlap the transactions is a misread (statement
  // issue date, payment due date). Trust the rows instead.
  if (transactions.length > 0 && periodStart && periodEnd) {
    const dates = transactions.map((t) => t.txnDate).sort();
    const minDate = dates[0] as string;
    const maxDate = dates[dates.length - 1] as string;
    if (toISODate(periodStart) > maxDate || toISODate(periodEnd) < minDate) {
      periodStart = null;
      periodEnd = null;
    }
  }

  // Some card statements print a second amount column (the billing amount)
  // that the model can mistake for a running balance. A real balance column
  // accumulates; a fake one just mirrors each row's own amount. When most
  // "balances" equal ±their own row's amount, discard them all.
  const withBalance = transactions.filter((t) => t.runningBalanceMinor != null);
  if (withBalance.length >= 3) {
    const mirrored = withBalance.filter(
      (t) => Math.abs(t.runningBalanceMinor ?? 0) === t.amountMinor,
    ).length;
    if (mirrored / withBalance.length > 0.6) {
      for (const t of transactions) t.runningBalanceMinor = null;
    }
  }

  // Statement polarity: a bank balance falls when money leaves; a credit-card
  // balance RISES with spending. Detect which one this statement is before
  // judging any row, from printed running balances (majority vote) with the
  // opening/closing equation as tiebreaker.
  const openingMinor = meta.openingBalance != null ? toMinor(meta.openingBalance, factor) : null;
  const closingMinor = meta.closingBalance != null ? toMinor(meta.closingBalance, factor) : null;

  let net = 0; // credits minus debits
  for (const t of transactions) {
    net += t.direction === "credit" ? t.amountMinor : -t.amountMinor;
  }
  const haveBalances = openingMinor != null && closingMinor != null;
  const deltaBank = haveBalances ? openingMinor + net - closingMinor : null;
  const deltaCard = haveBalances ? openingMinor - net - closingMinor : null;

  let bankVotes = 0;
  let cardVotes = 0;
  for (let i = 1; i < transactions.length; i++) {
    const prev = transactions[i - 1];
    const curr = transactions[i];
    if (!prev || !curr) continue;
    if (prev.runningBalanceMinor == null || curr.runningBalanceMinor == null) continue;
    const delta = curr.runningBalanceMinor - prev.runningBalanceMinor;
    const signed = curr.direction === "credit" ? curr.amountMinor : -curr.amountMinor;
    if (delta === signed) bankVotes++;
    else if (delta === -signed) cardVotes++;
  }

  let polarity: "bank" | "card";
  if (bankVotes !== cardVotes) {
    polarity = bankVotes > cardVotes ? "bank" : "card";
  } else if (deltaCard === 0 && deltaBank !== 0) {
    polarity = "card";
  } else {
    polarity = "bank";
  }

  // Per-row running-balance validation under the detected polarity.
  let balanceChecked = 0;
  let balanceOk = 0;
  for (let i = 1; i < transactions.length; i++) {
    const prev = transactions[i - 1];
    const curr = transactions[i];
    if (!prev || !curr) continue;
    if (prev.runningBalanceMinor == null || curr.runningBalanceMinor == null) continue;
    balanceChecked++;
    const signed = curr.direction === "credit" ? curr.amountMinor : -curr.amountMinor;
    const expected = polarity === "bank" ? signed : -signed;
    if (curr.runningBalanceMinor - prev.runningBalanceMinor === expected) {
      balanceOk++;
    } else {
      curr.confidence = Math.min(curr.confidence, 0.6);
    }
  }

  let reconciliationStatus: VerifiedStatement["reconciliationStatus"] = "no_balances";
  let reconciliationDeltaMinor: number | null = null;
  if (deltaBank != null && deltaCard != null) {
    reconciliationDeltaMinor = polarity === "bank" ? deltaBank : deltaCard;
    reconciliationStatus = reconciliationDeltaMinor === 0 ? "reconciled" : "mismatch";
  } else if (balanceChecked > 0 && balanceOk === balanceChecked) {
    // no printed opening/closing, but every printed running balance checks out
    reconciliationStatus = "reconciled";
    reconciliationDeltaMinor = 0;
  }

  return {
    bankName: meta.bankName,
    currency,
    accountNumberMasked: meta.accountNumberMasked,
    // fall back to the transactions' own span when no period is printed
    periodStart: periodStart
      ? toISODate(periodStart)
      : (transactions.map((t) => t.txnDate).sort()[0] ?? null),
    periodEnd: periodEnd
      ? toISODate(periodEnd)
      : (transactions
          .map((t) => t.txnDate)
          .sort()
          .at(-1) ?? null),
    openingBalanceMinor: openingMinor,
    closingBalanceMinor: closingMinor,
    reconciliationStatus,
    reconciliationDeltaMinor,
    transactions,
  };
}

function verifyRow(
  raw: RawTransaction,
  order: "DMY" | "MDY" | "YMD",
  factor: number,
  periodStart: Date | null,
  periodEnd: Date | null,
): VerifiedTransaction | null {
  const parts = parseDateToken(raw.date, order);
  if (!parts || parts.month < 1 || parts.month > 12 || parts.day < 1 || parts.day > 31) {
    return null;
  }
  const year = resolveYear(parts, periodStart, periodEnd);
  const date = new Date(year, parts.month - 1, parts.day);
  if (Number.isNaN(date.getTime())) return null;

  const merchantNorm = normalizeMerchant(raw.description);
  return {
    txnDate: toISODate(date),
    description: raw.description.trim(),
    merchantNorm,
    merchantDisplay: displayMerchant(merchantNorm),
    amountMinor: Math.abs(toMinor(raw.amount, factor)),
    direction: raw.direction,
    runningBalanceMinor: raw.runningBalance != null ? toMinor(raw.runningBalance, factor) : null,
    confidence: 1,
  };
}

function datePartsToDate(parts: DateParts | null): Date | null {
  if (!parts) return null;
  const year = parts.year ?? new Date().getFullYear();
  const date = new Date(year, parts.month - 1, parts.day);
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * Dedup hash: stable across re-uploads of the same transaction, distinct for
 * genuine same-day duplicates via the per-statement occurrence index.
 */
export async function dedupHashes(
  userId: string,
  transactions: VerifiedTransaction[],
): Promise<string[]> {
  const seen = new Map<string, number>();
  const hashes: string[] = [];
  for (const t of transactions) {
    const key = `${t.txnDate}|${t.amountMinor}|${t.direction}|${t.merchantNorm}`;
    const occurrence = seen.get(key) ?? 0;
    seen.set(key, occurrence + 1);
    hashes.push(await sha256Hex(`${userId}|${key}|${occurrence}`));
  }
  return hashes;
}

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
