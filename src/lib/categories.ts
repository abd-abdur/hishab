/**
 * System category taxonomy. Slugs are stable identifiers used by the merchant
 * dictionary, the categorization engine, and seeds. Colors are chart slots
 * (`chart-1`..`chart-12`) assigned here once and persisted per category row —
 * never derived from render order, so a category keeps its color everywhere.
 */

export type SystemCategory = {
  slug: string;
  name: string;
  icon: string; // lucide icon name, resolved by CategoryIcon
  color: string; // chart-N token slot
  kind: "expense" | "income" | "transfer";
  sortOrder: number;
};

export const SYSTEM_CATEGORIES: SystemCategory[] = [
  {
    slug: "groceries",
    name: "Groceries",
    icon: "shopping-basket",
    color: "chart-1",
    kind: "expense",
    sortOrder: 1,
  },
  {
    slug: "dining",
    name: "Dining",
    icon: "utensils",
    color: "chart-3",
    kind: "expense",
    sortOrder: 2,
  },
  {
    slug: "transport",
    name: "Transport",
    icon: "car",
    color: "chart-2",
    kind: "expense",
    sortOrder: 3,
  },
  { slug: "fuel", name: "Fuel", icon: "fuel", color: "chart-9", kind: "expense", sortOrder: 4 },
  {
    slug: "shopping",
    name: "Shopping",
    icon: "shopping-bag",
    color: "chart-4",
    kind: "expense",
    sortOrder: 5,
  },
  {
    slug: "utilities",
    name: "Utilities",
    icon: "plug-zap",
    color: "chart-5",
    kind: "expense",
    sortOrder: 6,
  },
  {
    slug: "telecom",
    name: "Telecom",
    icon: "smartphone",
    color: "chart-12",
    kind: "expense",
    sortOrder: 7,
  },
  {
    slug: "housing",
    name: "Rent & Housing",
    icon: "house",
    color: "chart-6",
    kind: "expense",
    sortOrder: 8,
  },
  {
    slug: "health",
    name: "Health",
    icon: "heart-pulse",
    color: "chart-8",
    kind: "expense",
    sortOrder: 9,
  },
  {
    slug: "entertainment",
    name: "Entertainment",
    icon: "clapperboard",
    color: "chart-7",
    kind: "expense",
    sortOrder: 10,
  },
  {
    slug: "travel",
    name: "Travel",
    icon: "plane",
    color: "chart-11",
    kind: "expense",
    sortOrder: 11,
  },
  {
    slug: "bnpl",
    name: "BNPL",
    icon: "credit-card",
    color: "chart-13",
    kind: "expense",
    sortOrder: 12,
  },
  {
    slug: "fees",
    name: "Fees & Charges",
    icon: "receipt",
    color: "chart-10",
    kind: "expense",
    sortOrder: 13,
  },
  {
    // money sent to OTHER people — spending, unlike own-account transfers
    slug: "p2p-out",
    name: "Sent to People",
    icon: "send",
    color: "chart-14",
    kind: "expense",
    sortOrder: 14,
  },
  {
    slug: "transfers",
    name: "Transfers",
    icon: "arrow-left-right",
    color: "chart-10",
    kind: "transfer",
    sortOrder: 15,
  },
  {
    // money received from OTHER people — income, unlike own-account transfers
    slug: "p2p-in",
    name: "Received from People",
    icon: "hand-coins",
    color: "chart-15",
    kind: "income",
    sortOrder: 16,
  },
  {
    slug: "income",
    name: "Income",
    icon: "banknote",
    color: "chart-1",
    kind: "income",
    sortOrder: 17,
  },
  {
    slug: "uncategorized",
    name: "Uncategorized",
    icon: "circle-dashed",
    color: "chart-10",
    kind: "expense",
    sortOrder: 18,
  },
];

export const CHART_SLOTS = Array.from({ length: 16 }, (_, i) => `chart-${i + 1}`);

/** Next unused chart slot for a user-created category. */
export function nextChartSlot(usedColors: string[]): string {
  const counts = new Map<string, number>(CHART_SLOTS.map((slot) => [slot, 0]));
  for (const color of usedColors) {
    const count = counts.get(color);
    if (count !== undefined) counts.set(color, count + 1);
  }
  let best = CHART_SLOTS[0] as string;
  let bestCount = Number.POSITIVE_INFINITY;
  for (const slot of CHART_SLOTS) {
    const count = counts.get(slot) ?? 0;
    if (count < bestCount) {
      best = slot;
      bestCount = count;
    }
  }
  return best;
}

/** CSS color for a stored chart slot: `chartColor("chart-3")` → `var(--chart-3)`. */
export function chartColor(slot: string): string {
  return `var(--${slot})`;
}
