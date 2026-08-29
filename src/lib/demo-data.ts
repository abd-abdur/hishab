/**
 * Believable AED demo dataset used by the landing page preview.
 * All amounts are integer fils. Nothing here reaches the database.
 */

export const DEMO_MONTH_LABEL = "August";

export const DEMO_CATEGORIES = [
  {
    categoryId: "demo-groceries",
    name: "Groceries",
    color: "chart-1",
    icon: "shopping-basket",
    spendMinor: 184_650,
    count: 14,
  },
  {
    categoryId: "demo-housing",
    name: "Rent & Housing",
    color: "chart-6",
    icon: "house",
    spendMinor: 650_000,
    count: 1,
  },
  {
    categoryId: "demo-dining",
    name: "Dining",
    color: "chart-3",
    icon: "utensils",
    spendMinor: 121_420,
    count: 19,
  },
  {
    categoryId: "demo-transport",
    name: "Transport",
    color: "chart-2",
    icon: "car",
    spendMinor: 63_780,
    count: 22,
  },
  {
    categoryId: "demo-utilities",
    name: "Utilities",
    color: "chart-5",
    icon: "plug-zap",
    spendMinor: 48_930,
    count: 3,
  },
  {
    categoryId: "demo-entertainment",
    name: "Entertainment",
    color: "chart-7",
    icon: "clapperboard",
    spendMinor: 22_470,
    count: 5,
  },
] as const;

export const DEMO_RECENT = [
  {
    id: "d1",
    date: "2026-08-18",
    merchant: "Carrefour",
    amountMinor: 21_735,
    direction: "debit" as const,
  },
  {
    id: "d2",
    date: "2026-08-18",
    merchant: "Careem",
    amountMinor: 3_450,
    direction: "debit" as const,
  },
  {
    id: "d3",
    date: "2026-08-17",
    merchant: "Salik",
    amountMinor: 800,
    direction: "debit" as const,
  },
  {
    id: "d4",
    date: "2026-08-17",
    merchant: "Talabat",
    amountMinor: 8_640,
    direction: "debit" as const,
  },
  {
    id: "d5",
    date: "2026-08-16",
    merchant: "DEWA",
    amountMinor: 41_230,
    direction: "debit" as const,
  },
] as const;

export const DEMO_RECURRING = [
  { id: "r1", merchant: "Netflix", nextDate: "01/09/2026", amountMinor: 4_500, priceChange: true },
  { id: "r2", merchant: "du", nextDate: "03/09/2026", amountMinor: 32_500, priceChange: false },
  { id: "r3", merchant: "Spotify", nextDate: "07/09/2026", amountMinor: 2_199, priceChange: false },
] as const;

export const DEMO_SPARKLINE = [
  { day: "2026-08-05", spendMinor: 14_200 },
  { day: "2026-08-06", spendMinor: 8_950 },
  { day: "2026-08-07", spendMinor: 31_400 },
  { day: "2026-08-08", spendMinor: 12_100 },
  { day: "2026-08-09", spendMinor: 6_300 },
  { day: "2026-08-10", spendMinor: 18_750 },
  { day: "2026-08-11", spendMinor: 9_800 },
  { day: "2026-08-12", spendMinor: 27_600 },
  { day: "2026-08-13", spendMinor: 11_450 },
  { day: "2026-08-14", spendMinor: 15_900 },
  { day: "2026-08-15", spendMinor: 44_100 },
  { day: "2026-08-16", spendMinor: 52_300 },
  { day: "2026-08-17", spendMinor: 13_200 },
  { day: "2026-08-18", spendMinor: 25_185 },
] as const;

export const DEMO_TOTALS = {
  spendToDateMinor: 1_091_250,
  paceVsPrevPct: -8,
  budgetsOnTrack: 4,
  budgetsTotal: 6,
};
