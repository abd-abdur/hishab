import { useCallback, useRef, useState } from "react";

import type { DraftRow, DraftStatement, IngestProgressEvent } from "@/lib/ingest/draft-schema";
import type { ParsedPage, ParseResponse } from "@/workers/statement-parser.worker";

/**
 * Drives the multi-file upload pipeline: files parse in parallel workers
 * (max 3 at once), then stream through the analysis endpoint (max 3 at once —
 * the server pools model calls per request, so this bounds total fan-out).
 * Each file progresses independently; nothing waits for the slowest file.
 */

export const MAX_FILES = 10;
export const MAX_FILE_BYTES = 15 * 1024 * 1024;

const PARSE_CONCURRENCY = 3;
const ANALYZE_CONCURRENCY = 3;

export type UploadFileState = {
  id: string;
  fileName: string;
  fileType: "pdf" | "image" | "csv" | "xlsx";
  status: "queued" | "parsing" | "analyzing" | "ready" | "error";
  parsePage: number;
  parseTotal: number;
  stage: IngestProgressEvent["stage"] | null;
  extractDone: number;
  extractTotal: number;
  rowsFound: number;
  draft: { statement: DraftStatement; rows: DraftRow[] } | null;
  error: string | null;
};

export function detectFileType(file: File): UploadFileState["fileType"] | null {
  const name = file.name.toLowerCase();
  if (name.endsWith(".pdf")) return "pdf";
  if (/\.(jpe?g|png|webp)$/.test(name)) return "image";
  if (name.endsWith(".csv") || name.endsWith(".txt")) return "csv";
  if (name.endsWith(".xlsx") || name.endsWith(".xls")) return "xlsx";
  if (file.type === "application/pdf") return "pdf";
  if (file.type.startsWith("image/")) return "image";
  return null;
}

class Semaphore {
  private queue: Array<() => void> = [];
  private available: number;
  constructor(count: number) {
    this.available = count;
  }
  async acquire(): Promise<() => void> {
    if (this.available > 0) {
      this.available--;
      return () => this.release();
    }
    await new Promise<void>((resolve) => this.queue.push(resolve));
    return () => this.release();
  }
  private release() {
    const next = this.queue.shift();
    if (next) next();
    else this.available++;
  }
}

function parseInWorker(
  file: { id: string; fileName: string; fileType: UploadFileState["fileType"] },
  buffer: ArrayBuffer,
  onProgress: (page: number, total: number) => void,
): Promise<ParsedPage[]> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(
      new URL("../../workers/statement-parser.worker.ts", import.meta.url),
      {
        type: "module",
      },
    );
    worker.onmessage = (event: MessageEvent<ParseResponse>) => {
      const message = event.data;
      if (message.id !== file.id) return;
      if (message.type === "progress") {
        onProgress(message.page, message.total);
      } else if (message.type === "done") {
        worker.terminate();
        resolve(message.pages);
      } else {
        worker.terminate();
        reject(new Error(message.message));
      }
    };
    worker.onerror = () => {
      worker.terminate();
      reject(new Error(`Couldn't read ${file.fileName}.`));
    };
    worker.postMessage({ id: file.id, fileName: file.fileName, fileType: file.fileType, buffer }, [
      buffer,
    ]);
  });
}

export function useStatementUpload() {
  const [files, setFiles] = useState<UploadFileState[]>([]);
  const parseSemaphore = useRef(new Semaphore(PARSE_CONCURRENCY));
  const analyzeSemaphore = useRef(new Semaphore(ANALYZE_CONCURRENCY));

  const update = useCallback((id: string, patch: Partial<UploadFileState>) => {
    setFiles((prev) => prev.map((f) => (f.id === id ? { ...f, ...patch } : f)));
  }, []);

  const processFile = useCallback(
    async (state: UploadFileState, file: File) => {
      // 1. parse in a worker
      const releaseParse = await parseSemaphore.current.acquire();
      let pages: ParsedPage[];
      try {
        update(state.id, { status: "parsing" });
        const buffer = await file.arrayBuffer();
        pages = await parseInWorker(state, buffer, (page, total) =>
          update(state.id, { parsePage: page, parseTotal: total }),
        );
      } catch (error) {
        update(state.id, {
          status: "error",
          error: error instanceof Error ? error.message : "Couldn't read this file.",
        });
        return;
      } finally {
        releaseParse();
      }

      // 2. stream through the analysis endpoint. The watchdog aborts if the
      // server goes quiet for too long, so the UI can never hang silently.
      const releaseAnalyze = await analyzeSemaphore.current.acquire();
      const controller = new AbortController();
      const STALL_MS = 120_000;
      let stallTimer = setTimeout(() => controller.abort(), STALL_MS);
      const resetStall = () => {
        clearTimeout(stallTimer);
        stallTimer = setTimeout(() => controller.abort(), STALL_MS);
      };
      try {
        update(state.id, { status: "analyzing", stage: "extracting" });
        const response = await fetch("/api/ingest", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ fileName: state.fileName, fileType: state.fileType, pages }),
          signal: controller.signal,
        });
        if (!response.ok || !response.body) {
          throw new Error(
            response.status === 401
              ? "Your session expired — please sign in again."
              : "The analysis couldn't start. Please try again.",
          );
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffered = "";
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          resetStall();
          buffered += decoder.decode(value, { stream: true });
          const lines = buffered.split("\n");
          buffered = lines.pop() ?? "";
          for (const line of lines) {
            if (!line.trim()) continue;
            const event = JSON.parse(line) as IngestProgressEvent;
            if (event.stage === "extracting") {
              update(state.id, {
                stage: "extracting",
                extractDone: event.done,
                extractTotal: event.total,
                rowsFound: event.rows,
              });
            } else if (event.stage === "ready") {
              update(state.id, { status: "ready", stage: "ready", draft: event.draft });
            } else if (event.stage === "error") {
              update(state.id, { status: "error", error: event.message });
            } else {
              update(state.id, { stage: event.stage });
            }
          }
        }
        setFiles((prev) =>
          prev.map((f) =>
            f.id === state.id && f.status === "analyzing"
              ? { ...f, status: "error", error: "The analysis was interrupted. Please try again." }
              : f,
          ),
        );
      } catch (error) {
        const aborted = error instanceof DOMException && error.name === "AbortError";
        update(state.id, {
          status: "error",
          error: aborted
            ? "The analysis stopped responding and was cancelled. Please try this file again."
            : error instanceof Error
              ? error.message
              : "Analysis failed. Please try again.",
        });
      } finally {
        clearTimeout(stallTimer);
        releaseAnalyze();
      }
    },
    [update],
  );

  // Live mirror of the list length so addFiles never depends on stale state
  // and never does work inside a setState updater (which must stay pure).
  const fileCountRef = useRef(0);

  const addFiles = useCallback(
    (incoming: File[]): string | null => {
      const accepted: Array<{ state: UploadFileState; file: File }> = [];
      let rejection: string | null = null;
      const room = MAX_FILES - fileCountRef.current;

      for (const file of incoming) {
        if (accepted.length >= room) {
          rejection = `Up to ${MAX_FILES} files at a time.`;
          break;
        }
        const fileType = detectFileType(file);
        if (!fileType) {
          rejection = `${file.name}: only PDF, JPG/PNG, CSV and Excel files are supported.`;
          continue;
        }
        if (file.size > MAX_FILE_BYTES) {
          rejection = `${file.name} is larger than 15 MB.`;
          continue;
        }
        accepted.push({
          state: {
            id: crypto.randomUUID(),
            fileName: file.name,
            fileType,
            status: "queued",
            parsePage: 0,
            parseTotal: 0,
            stage: null,
            extractDone: 0,
            extractTotal: 0,
            rowsFound: 0,
            draft: null,
            error: null,
          },
          file,
        });
      }

      if (accepted.length > 0) {
        fileCountRef.current += accepted.length;
        setFiles((prev) => [...prev, ...accepted.map((a) => a.state)]);
        for (const { state, file } of accepted) {
          void processFile(state, file);
        }
      }
      return rejection;
    },
    [processFile],
  );

  const removeFile = useCallback((id: string) => {
    fileCountRef.current = Math.max(0, fileCountRef.current - 1);
    setFiles((prev) => prev.filter((f) => f.id !== id));
  }, []);

  const updateDraftRows = useCallback((id: string, rows: DraftRow[]) => {
    setFiles((prev) =>
      prev.map((f) => (f.id === id && f.draft ? { ...f, draft: { ...f.draft, rows } } : f)),
    );
  }, []);

  const reset = useCallback(() => {
    fileCountRef.current = 0;
    setFiles([]);
  }, []);

  return { files, addFiles, removeFile, updateDraftRows, reset };
}
