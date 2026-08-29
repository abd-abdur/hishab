import { z } from "zod";

/**
 * The reviewable draft: what the analysis produces and the user approves
 * (possibly after edits) before anything is written to the database.
 */

export const DraftRowSchema = z.object({
  txnDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  description: z.string().min(1).max(500),
  merchantNorm: z.string().min(1).max(120),
  merchantDisplay: z.string().min(1).max(120),
  amountMinor: z.number().int().nonnegative(),
  direction: z.enum(["debit", "credit"]),
  runningBalanceMinor: z.number().int().nullable(),
  confidence: z.number().min(0).max(1),
  categoryId: z.string().min(1),
  categorySource: z.enum(["rule", "dictionary", "model", "user"]),
  dedupHash: z.string().length(64),
  /** true when an identical transaction already exists in the account */
  duplicate: z.boolean(),
});

export const DraftStatementSchema = z.object({
  fileName: z.string().min(1).max(255),
  fileType: z.enum(["pdf", "image", "csv", "xlsx"]),
  bankName: z.string().nullable(),
  currency: z.string().length(3),
  accountNumberMasked: z.string().nullable(),
  periodStart: z.string().nullable(),
  periodEnd: z.string().nullable(),
  openingBalanceMinor: z.number().int().nullable(),
  closingBalanceMinor: z.number().int().nullable(),
  reconciliationStatus: z.enum(["reconciled", "mismatch", "no_balances"]),
  reconciliationDeltaMinor: z.number().int().nullable(),
});

export const CommitInputSchema = z.object({
  statement: DraftStatementSchema,
  rows: z.array(DraftRowSchema).min(1).max(5000),
});

export type DraftRow = z.infer<typeof DraftRowSchema>;
export type DraftStatement = z.infer<typeof DraftStatementSchema>;
export type CommitInput = z.infer<typeof CommitInputSchema>;

/** Events streamed while a statement is being analyzed. */
export type IngestProgressEvent =
  | { stage: "extracting"; done: number; total: number; rows: number }
  | { stage: "verifying" }
  | { stage: "categorizing" }
  | { stage: "checking_duplicates" }
  | { stage: "ready"; draft: { statement: DraftStatement; rows: DraftRow[] } }
  | { stage: "error"; message: string };
