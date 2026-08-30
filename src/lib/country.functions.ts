import { createServerFn } from "@tanstack/react-start";
import { and, eq, sql } from "drizzle-orm";
import { generateObject } from "ai";
import { z } from "zod";

import { db } from "@/db/client";
import { transactions } from "@/db/schema";
import { authMiddleware } from "@/lib/auth-middleware";
import {
  categorizationModel,
  minimalThinking,
  MODEL_CALL_TIMEOUT_MS,
  withRetry,
} from "@/lib/ingest/model.server";

/**
 * Country refinement for rows ingested before merchant-country hints existed.
 * Many banks print bare merchant names ("Tim Hortons") with no location, so
 * those rows sit on the home-country default. The stored names are ciphertext,
 * so the browser decrypts them and sends (token, name) pairs here transiently;
 * the model's world knowledge fills in the country, keyed by merchant token.
 */

const HOME = "AE";

/** Merchants whose every row still carries the home-country default. */
export const getCountryRefinementCandidatesFn = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const rows = await db
      .select({
        token: transactions.merchantNorm,
        displayEnc: sql<string>`max(${transactions.merchantDisplay})`,
      })
      .from(transactions)
      .where(and(eq(transactions.userId, context.userId), eq(transactions.country, HOME)))
      .groupBy(transactions.merchantNorm)
      .limit(300);
    return rows;
  });

export const refineCountriesFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .inputValidator(
    z.object({
      merchants: z
        .array(z.object({ token: z.string().min(1).max(200), name: z.string().min(1).max(200) }))
        .min(1)
        .max(300),
    }),
  )
  .handler(async ({ data, context }) => {
    const schema = z.object({
      assignments: z.array(z.object({ name: z.string(), country: z.string().nullable() })),
    });
    const result = await withRetry(() =>
      generateObject({
        model: categorizationModel(),
        schema,
        system: `For each merchant name from a bank statement, output the ISO 3166-1 alpha-2 country code of where this merchant is most likely located, judged from the name alone (well-known chains, city words, language). The statement belongs to a UAE resident who also travels — local or ambiguous merchants are "AE". Output null when you genuinely can't tell; never guess for generic names.`,
        prompt: JSON.stringify(data.merchants.map((m) => m.name)),
        providerOptions: minimalThinking,
        abortSignal: AbortSignal.timeout(MODEL_CALL_TIMEOUT_MS),
      }),
    );

    const countryByName = new Map<string, string>();
    for (const a of result.object.assignments) {
      if (a.country && /^[A-Z]{2}$/i.test(a.country) && a.country.toUpperCase() !== HOME) {
        countryByName.set(a.name, a.country.toUpperCase());
      }
    }

    let updated = 0;
    for (const merchant of data.merchants) {
      const country = countryByName.get(merchant.name);
      if (!country) continue;
      const changed = await db
        .update(transactions)
        .set({ country })
        .where(
          and(
            eq(transactions.userId, context.userId),
            eq(transactions.merchantNorm, merchant.token),
            eq(transactions.country, HOME),
          ),
        )
        .returning({ id: transactions.id });
      updated += changed.length;
    }
    return { updated };
  });
