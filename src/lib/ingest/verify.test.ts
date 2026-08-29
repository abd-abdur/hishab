import { describe, expect, it } from "vitest";

import type { ExtractBatch } from "./extract-schema";
import { dedupHashes, resolveDateOrder, verifyStatement } from "./verify";

function batch(
  overrides: Partial<ExtractBatch["statement"]>,
  transactions: ExtractBatch["transactions"],
): ExtractBatch {
  return {
    statement: {
      bankName: "Test Bank",
      currency: "AED",
      accountNumberMasked: null,
      periodStart: null,
      periodEnd: null,
      openingBalance: null,
      closingBalance: null,
      dateFormatGuess: "unknown",
      ...overrides,
    },
    transactions,
  };
}

describe("resolveDateOrder", () => {
  it("detects DMY when a first component exceeds 12", () => {
    expect(resolveDateOrder(["05/07/2026", "28/07/2026"], "MDY")).toBe("DMY");
  });

  it("detects MDY when a second component exceeds 12", () => {
    expect(resolveDateOrder(["07/05/2026", "07/28/2026"], "DMY")).toBe("MDY");
  });

  it("falls back to the model guess when ambiguous", () => {
    expect(resolveDateOrder(["05/07/2026", "06/07/2026"], "MDY")).toBe("MDY");
  });

  it("defaults to DMY (UAE) when nothing decides", () => {
    expect(resolveDateOrder(["05/07/2026"], "unknown")).toBe("DMY");
  });

  it("detects YMD for ISO-style dates", () => {
    expect(resolveDateOrder(["2026-07-05"], "unknown")).toBe("YMD");
  });
});

describe("verifyStatement", () => {
  it("parses DD/MM dates and converts to minor units", () => {
    const result = verifyStatement(
      batch({}, [
        {
          date: "28/07/2026",
          description: "CARREFOUR MALL OF EMIRATES",
          amount: 217.35,
          direction: "debit",
          runningBalance: null,
        },
      ]),
    );
    expect(result.transactions).toHaveLength(1);
    expect(result.transactions[0]?.txnDate).toBe("2026-07-28");
    expect(result.transactions[0]?.amountMinor).toBe(21735);
  });

  it("parses textual month dates", () => {
    const result = verifyStatement(
      batch({}, [
        {
          date: "3 Jul 2026",
          description: "SALIK",
          amount: 8,
          direction: "debit",
          runningBalance: null,
        },
      ]),
    );
    expect(result.transactions[0]?.txnDate).toBe("2026-07-03");
  });

  it("reconciles when opening + net equals closing", () => {
    const result = verifyStatement(
      batch({ openingBalance: 1000, closingBalance: 1150 }, [
        {
          date: "01/08/2026",
          description: "SALARY",
          amount: 400,
          direction: "credit",
          runningBalance: null,
        },
        {
          date: "02/08/2026",
          description: "CARREFOUR",
          amount: 250,
          direction: "debit",
          runningBalance: null,
        },
      ]),
    );
    expect(result.reconciliationStatus).toBe("reconciled");
    expect(result.reconciliationDeltaMinor).toBe(0);
  });

  it("reconciles a credit-card statement where spending raises the balance", () => {
    const result = verifyStatement(
      batch({ openingBalance: 2450, closingBalance: 3000 }, [
        {
          date: "02/08/2026",
          description: "CARREFOUR",
          amount: 800,
          direction: "debit",
          runningBalance: 3250,
        },
        {
          date: "12/08/2026",
          description: "PAYMENT RECEIVED",
          amount: 250,
          direction: "credit",
          runningBalance: 3000,
        },
      ]),
    );
    expect(result.reconciliationStatus).toBe("reconciled");
    expect(result.reconciliationDeltaMinor).toBe(0);
    expect(result.transactions.every((t) => t.confidence === 1)).toBe(true);
  });

  it("detects card polarity from running balances even when totals mismatch", () => {
    const result = verifyStatement(
      batch({ openingBalance: 1000, closingBalance: 1600 }, [
        {
          date: "01/08/2026",
          description: "A",
          amount: 300,
          direction: "debit",
          runningBalance: 1300,
        },
        {
          date: "02/08/2026",
          description: "B",
          amount: 200,
          direction: "debit",
          runningBalance: 1500,
        },
      ]),
    );
    // card polarity chosen (balance rises with debits); 1000+500 = 1500 ≠ 1600
    expect(result.reconciliationStatus).toBe("mismatch");
    expect(result.reconciliationDeltaMinor).toBe(-10000);
  });

  it("discards a fake balance column that mirrors each row's own amount", () => {
    // card statements often print original amount + billing amount; the
    // second column is not a running balance
    const result = verifyStatement(
      batch({ openingBalance: 0, closingBalance: -350 }, [
        {
          date: "01/08/2026",
          description: "TABBY",
          amount: 100,
          direction: "debit",
          runningBalance: -100,
        },
        {
          date: "02/08/2026",
          description: "TALABAT",
          amount: 150,
          direction: "debit",
          runningBalance: -150,
        },
        {
          date: "03/08/2026",
          description: "DEWA",
          amount: 100,
          direction: "debit",
          runningBalance: -100,
        },
      ]),
    );
    expect(result.transactions.every((t) => t.runningBalanceMinor === null)).toBe(true);
    expect(result.reconciliationStatus).toBe("reconciled");
    expect(result.transactions.every((t) => t.confidence === 1)).toBe(true);
  });

  it("replaces a period that doesn't overlap the transactions with the row span", () => {
    // statement date + payment due date misread as the period
    const result = verifyStatement(
      batch({ periodStart: "14/08/2026", periodEnd: "30/08/2026" }, [
        {
          date: "13/07/2026",
          description: "A",
          amount: 10,
          direction: "debit",
          runningBalance: null,
        },
        {
          date: "10/08/2026",
          description: "B",
          amount: 10,
          direction: "debit",
          runningBalance: null,
        },
      ]),
    );
    expect(result.periodStart).toBe("2026-07-13");
    expect(result.periodEnd).toBe("2026-08-10");
  });

  it("flags a mismatch with the exact delta", () => {
    const result = verifyStatement(
      batch({ openingBalance: 1000, closingBalance: 1200 }, [
        {
          date: "01/08/2026",
          description: "SALARY",
          amount: 400,
          direction: "credit",
          runningBalance: null,
        },
        {
          date: "02/08/2026",
          description: "CARREFOUR",
          amount: 250,
          direction: "debit",
          runningBalance: null,
        },
      ]),
    );
    expect(result.reconciliationStatus).toBe("mismatch");
    expect(result.reconciliationDeltaMinor).toBe(-5000);
  });

  it("lowers confidence on rows whose running balance doesn't add up", () => {
    const result = verifyStatement(
      batch({}, [
        {
          date: "01/08/2026",
          description: "A",
          amount: 100,
          direction: "debit",
          runningBalance: 900,
        },
        {
          date: "02/08/2026",
          description: "B",
          amount: 50,
          direction: "debit",
          runningBalance: 800,
        },
      ]),
    );
    expect(result.transactions[1]?.confidence).toBeLessThan(1);
  });

  it("fills missing years from the statement period, handling year boundaries", () => {
    const result = verifyStatement(
      batch({ periodStart: "15/12/2025", periodEnd: "14/01/2026" }, [
        {
          date: "20/12",
          description: "DEC TXN",
          amount: 10,
          direction: "debit",
          runningBalance: null,
        },
        {
          date: "05/01",
          description: "JAN TXN",
          amount: 10,
          direction: "debit",
          runningBalance: null,
        },
      ]),
    );
    expect(result.transactions[0]?.txnDate).toBe("2025-12-20");
    expect(result.transactions[1]?.txnDate).toBe("2026-01-05");
  });
});

describe("dedupHashes", () => {
  const txn = {
    txnDate: "2026-08-01",
    description: "COFFEE",
    merchantNorm: "COFFEE",
    merchantDisplay: "Coffee",
    amountMinor: 1500,
    direction: "debit" as const,
    runningBalanceMinor: null,
    confidence: 1,
  };

  it("gives identical same-statement duplicates distinct hashes", async () => {
    const hashes = await dedupHashes("user1", [txn, { ...txn }]);
    expect(hashes[0]).not.toBe(hashes[1]);
  });

  it("is stable across re-uploads of the same rows", async () => {
    const first = await dedupHashes("user1", [txn, { ...txn }]);
    const second = await dedupHashes("user1", [txn, { ...txn }]);
    expect(first).toEqual(second);
  });

  it("differs between users", async () => {
    const [a] = await dedupHashes("user1", [txn]);
    const [b] = await dedupHashes("user2", [txn]);
    expect(a).not.toBe(b);
  });
});
