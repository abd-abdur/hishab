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

/**
 * Transcription is simple work — the fast multimodal model does it in ~2s per
 * batch where larger models take 30s+ for identical output (benchmarked), and
 * the deterministic verification layer catches transcription slips.
 */
export const extractionModel = () => getProvider()("gemini-3.1-flash-lite");

/** Same fast model for batch merchant categorization. */
export const categorizationModel = () => getProvider()("gemini-3.1-flash-lite");

/** Hard ceiling per model call so a stuck request fails fast instead of hanging the UI. */
export const MODEL_CALL_TIMEOUT_MS = 90_000;

/** Fastest response: no visible reasoning needed for transcription. */
export const minimalThinking = {
  google: { thinkingConfig: { thinkingLevel: "minimal" as const } },
};

/** Escalation setting for a re-run when verification finds a mismatch. */
export const highThinking = {
  google: { thinkingConfig: { thinkingLevel: "high" as const } },
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
