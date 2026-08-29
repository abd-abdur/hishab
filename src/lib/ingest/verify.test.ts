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
