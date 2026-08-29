import { z } from "zod";

/**
 * The model transcribes; it never computes. Totals, categories, insights and
 * reconciliation are all produced deterministically in code from these rows.
 */

export const RawTransactionSchema = z.object({
  /** Date exactly as printed on the statement, e.g. "03/07/2026" or "3 Jul 2026". */
  date: z.string(),
  description: z.string(),
  /** Absolute amount as printed; direction carries the sign. */
  amount: z.number(),
  direction: z.enum(["debit", "credit"]),
  /** Running balance after this row if the statement prints one, else null. */
  runningBalance: z.number().nullable(),
});

export const ExtractBatchSchema = z.object({
  statement: z.object({
    bankName: z.string().nullable(),
    /** ISO 4217 code exactly as identified on the statement, or null if absent. */
    currency: z.string().nullable(),
    accountNumberMasked: z.string().nullable(),
    periodStart: z.string().nullable(),
    periodEnd: z.string().nullable(),
    openingBalance: z.number().nullable(),
    closingBalance: z.number().nullable(),
    /** Which order day/month appear in the printed dates, judged from context. */
    dateFormatGuess: z.enum(["DMY", "MDY", "YMD", "unknown"]),
  }),
  transactions: z.array(RawTransactionSchema),
});

export type RawTransaction = z.infer<typeof RawTransactionSchema>;
export type ExtractBatch = z.infer<typeof ExtractBatchSchema>;

export const EXTRACTION_SYSTEM_PROMPT = `You transcribe bank statement content into structured rows.

Rules — follow them exactly:
- Transcribe transaction rows exactly as printed. Do NOT calculate, summarize, infer, or estimate any value that is not printed.
- Every transaction row in the input must appear exactly once in the output. Do not skip small rows, reversals, fees, or VAT lines.
- "date" is the transaction date string exactly as printed (prefer the transaction/posting date column if both exist).
- "amount" is the absolute value of the money moved in that row. Strip currency symbols and thousands separators.
- Card statements often print TWO amounts per row: the original-currency amount and the amount billed in the statement's currency (e.g. "CAD -20.00 | -54.69" on an AED statement). "amount" is ALWAYS the statement-currency (billing) amount — the rightmost amount column.
- "direction": "debit" when money leaves the account (withdrawals, purchases, fees), "credit" when money arrives (salary, deposits, refunds).
- Statements often print debit and credit in separate columns, or mark debits with DR/minus. Use the layout to decide direction.
- "runningBalance": the balance printed on that row, ONLY if the statement has a true cumulative balance column (each row's balance builds on the previous row's). A second amount column that merely repeats the row's own amount is NOT a balance — output null for every row in that case.
- Statement metadata (bankName, currency, balances, period): only what is actually printed on these pages; null when absent. Never guess a currency.
- periodStart/periodEnd are the span of transactions the statement covers. A statement issue date or a payment due date is NOT the period — output null rather than those.
- openingBalance / closingBalance: only if explicitly printed (e.g. "Opening balance", "Balance brought forward"). The first/last row's running balance is NOT an opening/closing balance.
- Non-transaction lines (headers, footers, page numbers, marketing) are ignored.
- Column separators: the text uses " | " between columns where the original layout had table columns.`;

export const CSV_SYSTEM_PROMPT = `${EXTRACTION_SYSTEM_PROMPT}

The input is tabular data exported from a bank (CSV/spreadsheet rows, first row may be headers). Map the columns to the output fields; the same rules apply.`;
