import { z } from "zod";

export const AnalysisSchema = z.object({
  bankName: z.string(),
  accountLabel: z.string(),
  currency: z.string(),
  periodLabel: z.string(),
  totalIncome: z.number(),
  totalExpenses: z.number(),
  netCashflow: z.number(),
  openingBalance: z.number(),
  closingBalance: z.number(),
  averageDailySpend: z.number(),
  transactionCount: z.number(),
  busiestDay: z.string(),
  savingsRate: z.number(),
  categories: z.array(
    z.object({
      name: z.string(),
      amount: z.number(),
      percentage: z.number(),
      transactions: z.number(),
    }),
  ),
  timeline: z.array(
    z.object({ label: z.string(), income: z.number(), expenses: z.number() }),
  ),
  topMerchants: z.array(
    z.object({ name: z.string(), amount: z.number(), count: z.number() }),
  ),
  recurring: z.array(
    z.object({ name: z.string(), amount: z.number(), cadence: z.string() }),
  ),
  largestTransactions: z.array(
    z.object({
      date: z.string(),
      description: z.string(),
      category: z.string(),
      amount: z.number(),
    }),
  ),
  insights: z.array(z.string()),
  recommendations: z.array(
    z.object({ title: z.string(), detail: z.string(), potentialSaving: z.number() }),
  ),
  healthScore: z.number(),
  healthVerdict: z.string(),
});

export type SpendingAnalysis = z.infer<typeof AnalysisSchema>;

export const AnalyzeInput = z.object({ text: z.string().min(30) });

export const ANALYST_SYSTEM_PROMPT = `You are a meticulous personal-finance analyst. You are given raw text extracted from a bank or card statement PDF.
Parse every transaction you can find and produce a complete spending analysis.
Rules:
- All money values are plain numbers in the statement currency. Expenses are POSITIVE numbers in "totalExpenses", category amounts, merchant amounts and recurring amounts. Income is positive in totalIncome. netCashflow = totalIncome - totalExpenses.
- categories: 5 to 8 meaningful spend categories (e.g. Groceries, Rent & Housing, Transport, Dining, Subscriptions, Shopping, Utilities, Health, Travel, Transfers). percentage is share of total expenses, 0-100, one decimal, summing to about 100.
- timeline: chronological buckets (per week if the statement covers one month, otherwise per month), at most 12 entries.
- topMerchants: up to 6. recurring: up to 6 likely subscriptions/standing orders. largestTransactions: up to 8, biggest expenses first.
- insights: 4 to 6 short, specific, data-backed sentences (max 160 characters each).
- recommendations: 3 to 4 concrete actions with an estimated monthly potentialSaving.
- healthScore is 0-100. healthVerdict is at most 8 words.
- If a value is genuinely absent, infer a sensible estimate from the data rather than returning 0. Never invent a currency: use the one in the statement, defaulting to "USD".`;
