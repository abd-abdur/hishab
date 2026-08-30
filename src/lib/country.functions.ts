import { createServerFn } from "@tanstack/react-start";
import { and, eq, sql } from "drizzle-orm";
import { generateObject } from "ai";
import { z } from "zod";

import { db } from "@/db/client";
import { transactions } from "@/db/schema";
import { authMiddleware } from "@/lib/auth-middleware";
import {
  categorizationModel,
  highThinking,
  MODEL_CALL_TIMEOUT_MS,
  withRetry,
} from "@/lib/ingest/model.server";

/**
 * Country refinement, browser-driven: merchant names are ciphertext here, so
 * the browser decrypts them, computes deterministic text signals, and sends
 * name+date pairs (transiently) for the rest. The model reasons about WHERE
 * each PURCHASE happened — trip windows anchored by the confirmed rows — not
 * where a brand is from: a Dubai Tim Hortons must stay AE.
 */

/** Every row's country-relevant skeleton plus the encrypted name to decrypt. */
export const getCountryAuditRowsFn = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    return db
      .select({
        id: transactions.id,
        txnDate: transactions.txnDate,
        description: transactions.description,
        currency: transactions.currency,
        country: transactions.country,
      })
      .from(transactions)
      .where(eq(transactions.userId, context.userId))
      .orderBy(transactions.txnDate)
      .limit(2000);
  });

const RowSchema = z.object({
  i: z.number().int().nonnegative(),
  name: z.string().min(1).max(120),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  /** country the row's own text asserts, when it does — the model must respect these */
  anchor: z.string().length(2).nullable(),
});

/** Model pass: assign a purchase country per row, or null to keep the default. */
export const suggestCountriesFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .inputValidator(z.object({ home: z.string().length(2), rows: z.array(RowSchema).min(1).max(600) }))
  .handler(async ({ data }) => {
    const schema = z.object({
      assignments: z.array(z.object({ i: z.number().int(), country: z.string().nullable() })),
    });
    const result = await withRetry(() =>
      generateObject({
        model: categorizationModel(),
        schema,
        system: `You determine WHERE each card purchase physically happened (ISO 3166-1 alpha-2), for a cardholder whose home country is ${data.home}.

You get every transaction: name, date, and "anchor" — a country the row's own text proves (city name, country code, foreign currency). Anchors are ground truth. Rows with anchor null are yours to judge.

How to judge:
- Look for travel windows: a run of days whose anchored rows sit in one foreign country means the cardholder was THERE. Un-anchored purchases on those days — restaurants, cafés, shops, local transit, food delivery — happened in that country too.
- A brand's origin is NOT its location. Tim Hortons, McDonald's, Starbucks, H&M, Machi Machi exist in many countries: inside a travel window they belong to the trip country; outside any window they are ${data.home}. Never assign a country because of where a chain is FROM.
- Online-only merchants (e-commerce, subscriptions, app stores, streaming) have no meaningful location: output null unless their text anchors one.
- Outside travel windows, output null (the home default applies).

Output one assignment per input row, using each row's "i".`,
        prompt: JSON.stringify(data.rows),
        providerOptions: highThinking,
        abortSignal: AbortSignal.timeout(MODEL_CALL_TIMEOUT_MS),
      }),
    );
    const assignments = result.object.assignments
      .filter((a) => a.country === null || /^[A-Z]{2}$/i.test(a.country ?? ""))
      .map((a) => ({ i: a.i, country: a.country ? a.country.toUpperCase() : null }));
    return { assignments };
  });

/** Write the recomputed countries — this column only, own rows only. */
export const applyCountryFixesFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .inputValidator(
    z.object({
      fixes: z
        .array(z.object({ id: z.string().min(1), country: z.string().length(2) }))
        .min(1)
        .max(500),
    }),
  )
  .handler(async ({ data, context }) => {
    let updated = 0;
    for (const fix of data.fixes) {
      const changed = await db
        .update(transactions)
        .set({ country: fix.country.toUpperCase() })
        .where(
          and(
            eq(transactions.id, fix.id),
            eq(transactions.userId, context.userId),
            sql`${transactions.country} is distinct from ${fix.country.toUpperCase()}`,
          ),
        )
        .returning({ id: transactions.id });
      updated += changed.length;
    }
    return { updated };
  });

/** Distinct countries present in the user's transactions, for the filter UI. */
export const getMyCountriesFn = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const rows = await db
      .select({ country: transactions.country, n: sql<string>`count(*)` })
      .from(transactions)
      .where(and(eq(transactions.userId, context.userId), sql`${transactions.country} is not null`))
      .groupBy(transactions.country)
      .orderBy(sql`count(*) desc`);
    return rows.map((r) => ({ country: r.country as string, count: Number(r.n) }));
  });
