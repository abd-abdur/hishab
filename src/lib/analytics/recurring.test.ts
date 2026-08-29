import { describe, expect, it } from "vitest";

import { detectRecurringSeries, type RecurringInput } from "./recurring";

function txn(
  date: string,
  amountMinor: number,
  merchant = "NETFLIX",
  categorySlug = "entertainment",
): RecurringInput {
  return {
    merchantNorm: merchant,
    merchantDisplay: merchant.toLowerCase(),
    categoryId: "cat1",
    categorySlug,
    txnDate: date,
    amountMinor,
    currency: "AED",
  };
}

describe("detectRecurringSeries", () => {
  it("detects a monthly subscription", () => {
    const series = detectRecurringSeries([
      txn("2026-05-01", 3900),
      txn("2026-06-01", 3900),
      txn("2026-07-01", 3900),
      txn("2026-08-01", 3900),
    ]);
    expect(series).toHaveLength(1);
    expect(series[0]?.cadence).toBe("monthly");
    expect(series[0]?.nextExpected).toBe("2026-09-01");
    expect(series[0]?.previousAmountMinor).toBeNull();
  });

  it("detects a price change on the latest charge", () => {
    const series = detectRecurringSeries([
      txn("2026-05-01", 3900),
      txn("2026-06-01", 3900),
      txn("2026-07-01", 3900),
      txn("2026-08-01", 4500),
    ]);
    expect(series).toHaveLength(1);
    expect(series[0]?.previousAmountMinor).toBe(3900);
    expect(series[0]?.lastAmountMinor).toBe(4500);
    expect(series[0]?.priceChangedAt).toBe("2026-08-01");
  });

  it("rejects merchants with fewer than three charges", () => {
    expect(detectRecurringSeries([txn("2026-07-01", 3900), txn("2026-08-01", 3900)])).toHaveLength(
      0,
    );
  });

  it("rejects irregular spending at the same merchant", () => {
    const series = detectRecurringSeries([
      txn("2026-08-01", 4200, "CARREFOUR", "groceries"),
      txn("2026-08-03", 18100, "CARREFOUR", "groceries"),
      txn("2026-08-04", 950, "CARREFOUR", "groceries"),
      txn("2026-08-19", 7600, "CARREFOUR", "groceries"),
    ]);
    expect(series).toHaveLength(0);
  });

  it("never turns habit categories into subscriptions, however regular", () => {
    // weekly grocery delivery with near-identical totals is a habit, not a bill
    const series = detectRecurringSeries([
      txn("2026-07-07", 2609, "NOON MINUTES", "groceries"),
      txn("2026-07-14", 2609, "NOON MINUTES", "groceries"),
      txn("2026-07-21", 2609, "NOON MINUTES", "groceries"),
      txn("2026-07-28", 2609, "NOON MINUTES", "groceries"),
    ]);
    expect(series).toHaveLength(0);
  });

  it("rejects billers whose amounts vary like shopping", () => {
    // right cadence and category, but every charge differs — not billing
    const series = detectRecurringSeries([
      txn("2026-05-01", 3500, "SOME SERVICE", "entertainment"),
      txn("2026-06-01", 3900, "SOME SERVICE", "entertainment"),
      txn("2026-07-01", 4300, "SOME SERVICE", "entertainment"),
      txn("2026-08-01", 3100, "SOME SERVICE", "entertainment"),
    ]);
    expect(series).toHaveLength(0);
  });

  it("detects weekly cadence", () => {
    const series = detectRecurringSeries([
      txn("2026-07-07", 5000, "GYM", "health"),
      txn("2026-07-14", 5000, "GYM", "health"),
      txn("2026-07-21", 5000, "GYM", "health"),
      txn("2026-07-28", 5000, "GYM", "health"),
    ]);
    expect(series[0]?.cadence).toBe("weekly");
  });
});
