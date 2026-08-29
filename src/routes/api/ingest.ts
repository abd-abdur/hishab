import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { auth } from "@/lib/auth.server";
import { categorizeTransactions } from "@/lib/ingest/categorize.server";
import type { DraftRow, IngestProgressEvent } from "@/lib/ingest/draft-schema";
import { extractStatement, type IngestPage } from "@/lib/ingest/extract.server";
import { findExistingHashes } from "@/lib/ingest/persist.server";
import { dedupHashes, verifyStatement } from "@/lib/ingest/verify";

const PageSchema = z.union([
  z.object({
    pageNumber: z.number().int(),
    kind: z.literal("text"),
    text: z.string().max(400_000),
  }),
  z.object({
    pageNumber: z.number().int(),
    kind: z.literal("image"),
    imageBase64: z.string().max(1_500_000),
  }),
]);

const IngestRequestSchema = z.object({
  fileName: z.string().min(1).max(255),
  fileType: z.enum(["pdf", "image", "csv", "xlsx"]),
  pages: z.array(PageSchema).min(1).max(120),
});

/**
 * Streams NDJSON progress events while a statement is analyzed, ending with
 * the reviewable draft. Nothing is persisted here — commit is a separate,
 * user-approved step.
 */
export const Route = createFileRoute("/api/ingest")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const session = await auth.api.getSession({ headers: request.headers });
        if (!session) return new Response("Unauthorized", { status: 401 });
        const userId = session.user.id;

        let body: unknown;
        try {
          body = await request.json();
        } catch {
          return new Response("Invalid JSON", { status: 400 });
        }
        const parsed = IngestRequestSchema.safeParse(body);
        if (!parsed.success) {
          return new Response("Invalid request", { status: 400 });
        }
        const { fileName, fileType, pages } = parsed.data;

        const encoder = new TextEncoder();
        const stream = new ReadableStream<Uint8Array>({
          async start(controller) {
            const send = (event: IngestProgressEvent) => {
              controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
            };
            try {
              send({ stage: "extracting", done: 0, total: 0, rows: 0 });
              const extracted = await extractStatement(pages as IngestPage[], {
                isTabular: fileType === "csv" || fileType === "xlsx",
                onProgress: (done, total, rows) => send({ stage: "extracting", done, total, rows }),
              });

              send({ stage: "verifying" });
              let verified = verifyStatement(extracted);

              // The fast pass rarely misses, but when the math doesn't
              // reconcile, re-read the statement once with deeper reasoning
              // and keep whichever result the arithmetic vouches for.
              if (verified.reconciliationStatus === "mismatch") {
                send({ stage: "rechecking" });
                try {
                  const careful = await extractStatement(pages as IngestPage[], {
                    isTabular: fileType === "csv" || fileType === "xlsx",
                    effort: "careful",
                  });
                  const reVerified = verifyStatement(careful);
                  const better =
                    reVerified.reconciliationStatus === "reconciled" ||
                    (reVerified.reconciliationStatus === "mismatch" &&
                      Math.abs(reVerified.reconciliationDeltaMinor ?? Infinity) <
                        Math.abs(verified.reconciliationDeltaMinor ?? Infinity));
                  if (better) verified = reVerified;
                } catch {
                  // keep the fast-pass result; the mismatch badge tells the user
                }
              }

              if (verified.transactions.length === 0) {
                send({
                  stage: "error",
                  message:
                    "No transactions could be read from this file. If it's a scan, make sure the pages are sharp and well-lit.",
                });
                controller.close();
                return;
              }

              send({ stage: "categorizing" });
              const categorized = await categorizeTransactions(userId, verified.transactions);

              send({ stage: "checking_duplicates" });
              const hashes = await dedupHashes(userId, categorized);
              const existing = await findExistingHashes(userId, hashes);

              const rows: DraftRow[] = categorized.map((t, i) => ({
                txnDate: t.txnDate,
                description: t.description,
                merchantNorm: t.merchantNorm,
                merchantDisplay: t.merchantDisplay,
                amountMinor: t.amountMinor,
                direction: t.direction,
                runningBalanceMinor: t.runningBalanceMinor,
                confidence: t.confidence,
                categoryId: t.categoryId,
                categorySource: t.categorySource,
                dedupHash: hashes[i] as string,
                duplicate: existing.has(hashes[i] as string),
              }));

              send({
                stage: "ready",
                draft: {
                  statement: {
                    fileName,
                    fileType,
                    bankName: verified.bankName,
                    currency: verified.currency,
                    accountNumberMasked: verified.accountNumberMasked,
                    periodStart: verified.periodStart,
                    periodEnd: verified.periodEnd,
                    openingBalanceMinor: verified.openingBalanceMinor,
                    closingBalanceMinor: verified.closingBalanceMinor,
                    reconciliationStatus: verified.reconciliationStatus,
                    reconciliationDeltaMinor: verified.reconciliationDeltaMinor,
                  },
                  rows,
                },
              });
            } catch (error) {
              console.error("ingest failed", error);
              send({
                stage: "error",
                message: "The analysis engine couldn't process this file. Please try again.",
              });
            } finally {
              controller.close();
            }
          },
        });

        return new Response(stream, {
          headers: {
            "content-type": "application/x-ndjson; charset=utf-8",
            "cache-control": "no-cache",
          },
        });
      },
    },
  },
});
