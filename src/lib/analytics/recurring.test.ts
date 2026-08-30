import { describe, expect, it } from "vitest";

import { comingUpWindow, detectRecurringSeries, type RecurringInput } from "./recurring";

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

    // food delivery is the same habit under a different slug
    const delivery = detectRecurringSeries([
      txn("2026-06-11", 9000, "TALABAT", "online-orders"),
      txn("2026-07-11", 9000, "TALABAT", "online-orders"),
      txn("2026-08-11", 9000, "TALABAT", "online-orders"),
    ]);
    expect(delivery).toHaveLength(0);
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

describe("priceSteps", () => {
  it("records one step for a never-changed price", () => {
    const series = detectRecurringSeries([
      txn("2026-05-01", 3900),
      txn("2026-06-01", 3900),
      txn("2026-07-01", 3900),
    ]);
    expect(series[0]?.priceSteps).toEqual([{ date: "2026-05-01", amountMinor: 3900 }]);
  });

  it("records each step of a price ladder in order", () => {
    const series = detectRecurringSeries([
      txn("2026-02-01", 2900),
      txn("2026-03-01", 3900),
      txn("2026-04-01", 3900),
      txn("2026-05-01", 3900),
      txn("2026-06-01", 3900),
      txn("2026-07-01", 3900),
      txn("2026-08-01", 4900),
    ]);
    expect(series[0]?.priceSteps).toEqual([
      { date: "2026-02-01", amountMinor: 2900 },
      { date: "2026-03-01", amountMinor: 3900 },
      { date: "2026-08-01", amountMinor: 4900 },
    ]);
  });

  it("ignores jitter within 2% of the current step", () => {
    const series = detectRecurringSeries([
      txn("2026-05-01", 10000),
      txn("2026-06-01", 10100),
      txn("2026-07-01", 10000),
      txn("2026-08-01", 9950),
    ]);
    expect(series[0]?.priceSteps).toHaveLength(1);
  });
});

describe("comingUpWindow", () => {
  it("spans today to month-end for the current month", () => {
    expect(comingUpWindow("2026-08-30", "2026-08")).toEqual({
      from: "2026-08-30",
      to: "2026-08-31",
      label: "this month",
    });
  });

  it("spans the next 30 days for a past month", () => {
    expect(comingUpWindow("2026-08-30", "2026-07")).toEqual({
      from: "2026-08-30",
      to: "2026-09-29",
      label: "next 30 days",
    });
  });

  it("spans the next 30 days for all time", () => {
    const w = comingUpWindow("2026-08-30", "all");
    expect(w.label).toBe("next 30 days");
    expect(w.to).toBe("2026-09-29");
  });
});
