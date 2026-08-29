import {
  pgTable,
  text,
  timestamp,
  boolean,
  date,
  bigint,
  integer,
  real,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";

/* ------------------------------------------------------------------ */
/* better-auth tables (shape required by the drizzle adapter)          */
/* ------------------------------------------------------------------ */

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  twoFactorEnabled: boolean("two_factor_enabled").notNull().default(false),
  /** Last time the email was proven; accounts re-verify every 7 days. */
  lastVerifiedAt: timestamp("last_verified_at").notNull().defaultNow(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const session = pgTable("session", {
  id: text("id").primaryKey(),
  expiresAt: timestamp("expires_at").notNull(),
  token: text("token").notNull().unique(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
});

export const account = pgTable("account", {
  id: text("id").primaryKey(),
  issuer: text("issuer").notNull(),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: timestamp("access_token_expires_at"),
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
  scope: text("scope"),
  password: text("password"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const verification = pgTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const twoFactor = pgTable("two_factor", {
  id: text("id").primaryKey(),
  secret: text("secret").notNull(),
  backupCodes: text("backup_codes").notNull(),
  verified: boolean("verified").notNull().default(false),
  failedVerificationCount: integer("failed_verification_count").notNull().default(0),
  lockedUntil: timestamp("locked_until"),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
});

/** better-auth rate-limit counters. Database-backed so limits hold across serverless instances. */
export const rateLimit = pgTable("rate_limit", {
  id: text("id").primaryKey(),
  key: text("key").notNull(),
  count: integer("count").notNull(),
  lastRequest: bigint("last_request", { mode: "number" }).notNull(),
});

/* ------------------------------------------------------------------ */
/* Finance model — all money is integer minor units (fils)             */
/* ------------------------------------------------------------------ */

export const categories = pgTable(
  "categories",
  {
    id: text("id").primaryKey(),
    /** NULL = system category shared by everyone */
    userId: text("user_id").references(() => user.id, { onDelete: "cascade" }),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    icon: text("icon").notNull().default("circle-dashed"),
    /** chart color slot, e.g. "chart-3" — stable per category */
    color: text("color").notNull(),
    kind: text("kind", { enum: ["expense", "income", "transfer"] })
      .notNull()
      .default("expense"),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("categories_user_slug_idx").on(t.userId, t.slug)],
);

export const statements = pgTable(
  "statements",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    fileName: text("file_name").notNull(),
    fileType: text("file_type", { enum: ["pdf", "image", "csv", "xlsx"] }).notNull(),
    bankName: text("bank_name"),
    accountLabel: text("account_label"),
    accountNumberMasked: text("account_number_masked"),
    currency: text("currency").notNull().default("AED"),
    periodStart: date("period_start"),
    periodEnd: date("period_end"),
    openingBalanceMinor: bigint("opening_balance_minor", { mode: "number" }),
    closingBalanceMinor: bigint("closing_balance_minor", { mode: "number" }),
    transactionCount: integer("transaction_count").notNull().default(0),
    duplicateCount: integer("duplicate_count").notNull().default(0),
    reconciliationStatus: text("reconciliation_status", {
      enum: ["reconciled", "mismatch", "no_balances"],
    })
      .notNull()
      .default("no_balances"),
    reconciliationDeltaMinor: bigint("reconciliation_delta_minor", { mode: "number" }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [index("statements_user_idx").on(t.userId, t.createdAt)],
);

export const transactions = pgTable(
  "transactions",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    statementId: text("statement_id")
      .notNull()
      .references(() => statements.id, { onDelete: "cascade" }),
    txnDate: date("txn_date").notNull(),
    description: text("description").notNull(),
    merchantNorm: text("merchant_norm").notNull(),
    merchantDisplay: text("merchant_display").notNull(),
    /** always positive; direction carries the sign */
    amountMinor: bigint("amount_minor", { mode: "number" }).notNull(),
    direction: text("direction", { enum: ["debit", "credit"] }).notNull(),
    runningBalanceMinor: bigint("running_balance_minor", { mode: "number" }),
    currency: text("currency").notNull().default("AED"),
    categoryId: text("category_id")
      .notNull()
      .references(() => categories.id),
    categorySource: text("category_source", {
      enum: ["rule", "dictionary", "model", "user"],
    }).notNull(),
    confidence: real("confidence").notNull().default(1),
    isAnomaly: boolean("is_anomaly").notNull().default(false),
    dedupHash: text("dedup_hash").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("transactions_user_dedup_idx").on(t.userId, t.dedupHash),
    index("transactions_user_date_idx").on(t.userId, t.txnDate),
    index("transactions_user_merchant_idx").on(t.userId, t.merchantNorm),
    index("transactions_user_category_idx").on(t.userId, t.categoryId),
  ],
);

export const categoryRules = pgTable(
  "category_rules",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    matchType: text("match_type", { enum: ["merchant_exact", "contains"] }).notNull(),
    pattern: text("pattern").notNull(),
    categoryId: text("category_id")
      .notNull()
      .references(() => categories.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("category_rules_user_pattern_idx").on(t.userId, t.matchType, t.pattern)],
);

/** Global, seeded with common UAE merchants. No per-user rows. */
export const merchantDictionary = pgTable("merchant_dictionary", {
  merchantNorm: text("merchant_norm").primaryKey(),
  displayName: text("display_name").notNull(),
  categorySlug: text("category_slug").notNull(),
});

export const budgets = pgTable(
  "budgets",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    categoryId: text("category_id")
      .notNull()
      .references(() => categories.id, { onDelete: "cascade" }),
    monthlyLimitMinor: bigint("monthly_limit_minor", { mode: "number" }).notNull(),
    currency: text("currency").notNull().default("AED"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("budgets_user_category_idx").on(t.userId, t.categoryId)],
);

export const recurringSeries = pgTable(
  "recurring_series",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    merchantNorm: text("merchant_norm").notNull(),
    merchantDisplay: text("merchant_display").notNull(),
    categoryId: text("category_id")
      .notNull()
      .references(() => categories.id),
    cadence: text("cadence", { enum: ["weekly", "monthly", "yearly"] }).notNull(),
    avgAmountMinor: bigint("avg_amount_minor", { mode: "number" }).notNull(),
    lastAmountMinor: bigint("last_amount_minor", { mode: "number" }).notNull(),
    /** previous amount when a price change was detected, else null */
    previousAmountMinor: bigint("previous_amount_minor", { mode: "number" }),
    priceChangedAt: date("price_changed_at"),
    currency: text("currency").notNull().default("AED"),
    occurrences: integer("occurrences").notNull().default(0),
    lastSeen: date("last_seen").notNull(),
    nextExpected: date("next_expected"),
    active: boolean("active").notNull().default(true),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("recurring_user_merchant_idx").on(t.userId, t.merchantNorm, t.cadence)],
);

/**
 * One row per /api/ingest call, for per-user quota enforcement. Ingestion fans
 * out multiple model calls per upload, so it is both the cost center and the
 * abuse surface; rows older than the quota window are pruned opportunistically.
 */
export const ingestEvents = pgTable(
  "ingest_events",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    pageCount: integer("page_count").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [index("ingest_events_user_time_idx").on(t.userId, t.createdAt)],
);

/** Cached natural-language insights, generated from computed aggregates only. */
export const insightsCache = pgTable(
  "insights_cache",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    month: text("month").notNull(), // "2026-08"
    aggregatesHash: text("aggregates_hash").notNull(),
    insights: text("insights").notNull(), // JSON array of strings
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("insights_user_month_idx").on(t.userId, t.month)],
);
