import { generateText } from "ai";
import { eq, and } from "drizzle-orm";

import { db } from "@/db/client";
import { insightsCache } from "@/db/schema";
import {
  categorizationModel,
  minimalThinking,
  MODEL_CALL_TIMEOUT_MS,
  withRetry,
} from "@/lib/ingest/model.server";

/**
 * The only model use outside ingestion: turn ALREADY-COMPUTED aggregates into
 * a few plain-language observations. The model never sees raw statements here
 * and is instructed to use only the provided numbers. Cached per (user, month,
 * aggregates-hash) so it re-generates only when the data changes.
 */

export async function getInsights(
  userId: string,
  month: string,
  aggregates: Record<string, unknown>,
): Promise<string[]> {
  const payload = JSON.stringify(aggregates);
  const hash = await sha256Hex(payload);

  const [cached] = await db
    .select()
    .from(insightsCache)
    .where(and(eq(insightsCache.userId, userId), eq(insightsCache.month, month)));
  if (cached && cached.aggregatesHash === hash) {
    try {
      return JSON.parse(cached.insights) as string[];
    } catch {
      /* regenerate */
    }
  }

  let insights: string[];
  try {
    const result = await withRetry(() =>
      generateText({
        model: categorizationModel(),
        system: `You write concise spending observations for a personal finance dashboard.
Rules: use ONLY the numbers in the provided JSON — never invent, extrapolate, or estimate figures. If previousMonthDataPartial is true, do not compare against the previous month at all — its data is incomplete. Write 3 to 5 observations, one sentence each, most useful first. Prefer what a chart doesn't show at a glance — month-over-month changes, pace versus last month, budget projections — over restating single totals. Format amounts with the currency code given in the JSON, like "AED 1,240". Refer to months by name. No advice-column tone, no exclamation marks, no emoji. Return one observation per line, no bullets or numbering.`,
        prompt: payload,
        providerOptions: minimalThinking,
        abortSignal: AbortSignal.timeout(MODEL_CALL_TIMEOUT_MS),
      }),
    );
    insights = result.text
      .split("\n")
      .map((line) => line.replace(/^[-•*\d.)\s]+/, "").trim())
      .filter((line) => line.length > 0)
      .slice(0, 5);
  } catch {
    return [];
  }

  await db
    .insert(insightsCache)
    .values({
      id: crypto.randomUUID(),
      userId,
      month,
      aggregatesHash: hash,
      insights: JSON.stringify(insights),
    })
    .onConflictDoUpdate({
      target: [insightsCache.userId, insightsCache.month],
      set: { aggregatesHash: hash, insights: JSON.stringify(insights) },
    });

  return insights;
}

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
