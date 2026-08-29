/**
 * Deterministic recurring-charge detection. Pure function — unit-testable.
 * A merchant becomes a series when it has ≥3 debits whose date gaps cluster
 * around a weekly/monthly/yearly cadence and whose amounts look like BILLING,
 * not shopping: most charges identical to the fil (or near-zero variance).
 * Habit categories (groceries, dining, transport…) never form series — a
 * weekly Noon Minutes order is a habit, not a subscription.
 */

export type RecurringInput = {
  merchantNorm: string;
  merchantDisplay: string;
  categoryId: string;
  categorySlug: string;
  txnDate: string; // ISO
  amountMinor: number;
  currency: string;
};

/** Spending habits, not billers — excluded from recurring detection. */
const HABIT_CATEGORY_SLUGS = new Set([
  "groceries",
  "dining",
  "transport",
  "fuel",
  "shopping",
  "travel",
  "transfers",
  "p2p-out",
  "p2p-in",
  "uncategorized",
]);

export type DetectedSeries = {
  merchantNorm: string;
  merchantDisplay: string;
  categoryId: string;
  cadence: "weekly" | "monthly" | "yearly";
  avgAmountMinor: number;
  lastAmountMinor: number;
  previousAmountMinor: number | null;
  priceChangedAt: string | null;
  currency: string;
  occurrences: number;
  lastSeen: string;
  nextExpected: string;
};

const CADENCES: Array<{ name: DetectedSeries["cadence"]; days: number }> = [
  { name: "weekly", days: 7 },
  { name: "monthly", days: 30.44 },
  { name: "yearly", days: 365.25 },
];

const DAY_MS = 86_400_000;

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid] as number;
  return ((sorted[mid - 1] as number) + (sorted[mid] as number)) / 2;
}

export function detectRecurringSeries(transactions: RecurringInput[]): DetectedSeries[] {
  const byMerchant = new Map<string, RecurringInput[]>();
  for (const t of transactions) {
    const list = byMerchant.get(t.merchantNorm) ?? [];
    list.push(t);
    byMerchant.set(t.merchantNorm, list);
  }

  const series: DetectedSeries[] = [];
  for (const [merchantNorm, txns] of byMerchant) {
    if (txns.length < 3) continue;
    if (txns.some((t) => HABIT_CATEGORY_SLUGS.has(t.categorySlug))) continue;
    const sorted = [...txns].sort((a, b) => a.txnDate.localeCompare(b.txnDate));

    const gaps: number[] = [];
    for (let i = 1; i < sorted.length; i++) {
      const prev = new Date(sorted[i - 1]!.txnDate).getTime();
      const curr = new Date(sorted[i]!.txnDate).getTime();
      const gap = (curr - prev) / DAY_MS;
      if (gap > 0) gaps.push(gap);
    }
    if (gaps.length < 2) continue;

    const medianGap = median(gaps);
    const cadence = CADENCES.find((c) => Math.abs(medianGap - c.days) <= c.days * 0.2);
    if (!cadence) continue;

    // Billing, not shopping: most charges must be IDENTICAL to the fil
    // (subscriptions bill fixed amounts; a price change is one deviation),
    // or the variance must be near zero.
    const amounts = sorted.map((t) => t.amountMinor);
    const mean = amounts.reduce((a, b) => a + b, 0) / amounts.length;
    if (mean <= 0) continue;
    const counts = new Map<number, number>();
    for (const a of amounts) counts.set(a, (counts.get(a) ?? 0) + 1);
    const modeShare = Math.max(...counts.values()) / amounts.length;
    const variance = amounts.reduce((sum, a) => sum + (a - mean) ** 2, 0) / amounts.length;
    const cv = Math.sqrt(variance) / mean;
    if (modeShare < 0.6 && cv >= 0.08) continue;

    const last = sorted[sorted.length - 1]!;
    const priorAmounts = amounts.slice(0, -1);
    const priorMedian = median(priorAmounts);
    const changed =
      priorMedian > 0 && Math.abs(last.amountMinor - priorMedian) / priorMedian > 0.02;

    const nextExpected = new Date(
      new Date(last.txnDate).getTime() + Math.round(medianGap) * DAY_MS,
    );

    series.push({
      merchantNorm,
      merchantDisplay: last.merchantDisplay,
      categoryId: last.categoryId,
      cadence: cadence.name,
      avgAmountMinor: Math.round(mean),
      lastAmountMinor: last.amountMinor,
      previousAmountMinor: changed ? Math.round(priorMedian) : null,
      priceChangedAt: changed ? last.txnDate : null,
      currency: last.currency,
      occurrences: sorted.length,
      lastSeen: last.txnDate,
      nextExpected: nextExpected.toISOString().slice(0, 10),
    });
  }

  return series.sort((a, b) => (a.nextExpected < b.nextExpected ? -1 : 1));
}
