import { generateObject } from "ai";
import type { ImagePart, TextPart } from "ai";

import {
  CSV_SYSTEM_PROMPT,
  EXTRACTION_SYSTEM_PROMPT,
  ExtractBatchSchema,
  type ExtractBatch,
} from "./extract-schema";
import { extractionModel, lowThinking, mapPool, withRetry } from "./model.server";

/**
 * Fan-out extraction: page batches run as parallel model calls through a
 * bounded pool, then merge into one ExtractBatch per statement.
 */

export type IngestPage =
  | { pageNumber: number; kind: "text"; text: string }
  | { pageNumber: number; kind: "image"; imageBase64: string };

const TEXT_PAGES_PER_BATCH = 8;
const IMAGE_PAGES_PER_BATCH = 4;
export const MODEL_CONCURRENCY = 5;

function batchPages(pages: IngestPage[]): IngestPage[][] {
  const batches: IngestPage[][] = [];
  let current: IngestPage[] = [];
  for (const page of pages) {
    const limit = page.kind === "image" ? IMAGE_PAGES_PER_BATCH : TEXT_PAGES_PER_BATCH;
    const currentHasImages = current.some((p) => p.kind === "image");
    const effectiveLimit =
      currentHasImages || page.kind === "image" ? IMAGE_PAGES_PER_BATCH : limit;
    if (current.length >= effectiveLimit) {
      batches.push(current);
      current = [];
    }
    current.push(page);
  }
  if (current.length > 0) batches.push(current);
  return batches;
}

function batchToContent(batch: IngestPage[]): Array<TextPart | ImagePart> {
  const parts: Array<TextPart | ImagePart> = [];
  for (const page of batch) {
    if (page.kind === "text") {
      parts.push({ type: "text", text: `--- Page ${page.pageNumber} ---\n${page.text}` });
    } else {
      parts.push({ type: "text", text: `--- Page ${page.pageNumber} (image) ---` });
      parts.push({ type: "image", image: page.imageBase64, mediaType: "image/jpeg" });
    }
  }
  parts.push({
    type: "text",
    text: "Transcribe every transaction row on these pages, plus any statement metadata printed on them.",
  });
  return parts;
}

async function extractBatch(batch: IngestPage[], isTabular: boolean): Promise<ExtractBatch> {
  const result = await withRetry(() =>
    generateObject({
      model: extractionModel(),
      schema: ExtractBatchSchema,
      system: isTabular ? CSV_SYSTEM_PROMPT : EXTRACTION_SYSTEM_PROMPT,
      messages: [{ role: "user", content: batchToContent(batch) }],
      providerOptions: lowThinking,
    }),
  );
  return result.object;
}

function mergeMeta(batches: ExtractBatch[]): ExtractBatch["statement"] {
  const merged: ExtractBatch["statement"] = {
    bankName: null,
    currency: null,
    accountNumberMasked: null,
    periodStart: null,
    periodEnd: null,
    openingBalance: null,
    closingBalance: null,
    dateFormatGuess: "unknown",
  };
  for (const batch of batches) {
    const meta = batch.statement;
    merged.bankName ??= meta.bankName;
    merged.currency ??= meta.currency;
    merged.accountNumberMasked ??= meta.accountNumberMasked;
    merged.periodStart ??= meta.periodStart;
    merged.periodEnd ??= meta.periodEnd;
    merged.openingBalance ??= meta.openingBalance;
    // closing balance usually appears on the LAST page — take the last non-null
    if (meta.closingBalance != null) merged.closingBalance = meta.closingBalance;
    if (merged.dateFormatGuess === "unknown" && meta.dateFormatGuess !== "unknown") {
      merged.dateFormatGuess = meta.dateFormatGuess;
    }
  }
  return merged;
}

/**
 * Extract one statement. `onProgress` fires as each page batch completes so
 * the client can show live counts while other statements are still running.
 */
export async function extractStatement(
  pages: IngestPage[],
  options: {
    isTabular: boolean;
    onProgress?: (done: number, total: number, rowsSoFar: number) => void;
  },
): Promise<ExtractBatch> {
  const batches = batchPages(pages);
  let done = 0;
  let rows = 0;

  const results = await mapPool(batches, MODEL_CONCURRENCY, async (batch) => {
    const extracted = await extractBatch(batch, options.isTabular);
    done++;
    rows += extracted.transactions.length;
    options.onProgress?.(done, batches.length, rows);
    return extracted;
  });

  return {
    statement: mergeMeta(results),
    // batches preserve page order; concatenation preserves statement order
    transactions: results.flatMap((r) => r.transactions),
  };
}
