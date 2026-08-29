import { createGoogleGenerativeAI } from "@ai-sdk/google";

/**
 * The only file that knows which models power the analysis engine.
 * Never import from client code; never surface these names in UI copy.
 */

let provider: ReturnType<typeof createGoogleGenerativeAI> | null = null;

function getProvider() {
  if (!provider) {
    const key = process.env["GEMINI_API_KEY"] ?? process.env["GOOGLE_GENERATIVE_AI_API_KEY"];
    if (!key) {
      throw new Error("GEMINI_API_KEY is not set");
    }
    provider = createGoogleGenerativeAI({ apiKey: key });
  }
  return provider;
}

/** Fast multimodal model used for statement transcription. */
export const extractionModel = () => getProvider()("gemini-3.7-flash");

/** Cheapest model, used only for batch merchant categorization. */
export const categorizationModel = () => getProvider()("gemini-3.1-flash-lite");

/** Keep extraction snappy: transcription needs no deep reasoning. */
export const lowThinking = {
  google: { thinkingConfig: { thinkingLevel: "low" as const } },
};

/**
 * Bounded-concurrency map. Runs `fn` over `items` with at most `limit`
 * in flight; rejects on first failure. The global pool for model calls.
 */
export async function mapPool<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await fn(items[index] as T, index);
    }
  });
  await Promise.all(workers);
  return results;
}

/** Retry helper for 429/5xx from the model API. */
export async function withRetry<T>(fn: () => Promise<T>, attempts = 3): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      const status =
        error != null && typeof error === "object" && "statusCode" in error
          ? Number((error as { statusCode: unknown }).statusCode)
          : undefined;
      const retryable = status === undefined || status === 429 || status >= 500;
      if (!retryable || attempt === attempts - 1) throw error;
      await new Promise((resolve) => setTimeout(resolve, 750 * 2 ** attempt));
    }
  }
  throw lastError;
}
