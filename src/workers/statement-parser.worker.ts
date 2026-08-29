/// <reference lib="webworker" />

/**
 * All file parsing happens off the main thread. For PDFs the extraction is
 * coordinate-aware: text items are clustered into lines by y, ordered by x,
 * and column gaps become " | " separators so table structure survives.
 * Pages without a usable text layer (scans) are rendered to JPEG and sent
 * as images instead. CSV/XLSX are normalized to pipe-separated text pages.
 */

export type ParseRequest = {
  id: string;
  fileName: string;
  fileType: "pdf" | "image" | "csv" | "xlsx";
  buffer: ArrayBuffer;
};

export type ParsedPage =
  | { pageNumber: number; kind: "text"; text: string }
  | { pageNumber: number; kind: "image"; imageBase64: string };

export type ParseResponse =
  | { id: string; type: "progress"; page: number; total: number }
  | { id: string; type: "done"; pages: ParsedPage[] }
  | { id: string; type: "error"; message: string };

const SCAN_TEXT_THRESHOLD = 40; // chars of real text below which a page is treated as scanned
const MAX_IMAGE_WIDTH = 1400;
const JPEG_QUALITY = 0.8;
const CSV_ROWS_PER_PAGE = 150;

self.onmessage = async (event: MessageEvent<ParseRequest>) => {
  const { id, fileType, buffer, fileName } = event.data;
  const post = (message: ParseResponse) => (self as unknown as Worker).postMessage(message);
  try {
    let pages: ParsedPage[];
    switch (fileType) {
      case "pdf":
        pages = await parsePdf(buffer, (page, total) =>
          post({ id, type: "progress", page, total }),
        );
        break;
      case "image":
        pages = [await imageToPage(buffer, 1)];
        break;
      case "csv":
        pages = parseCsvText(new TextDecoder().decode(buffer));
        break;
      case "xlsx":
        pages = await parseXlsx(buffer);
        break;
    }
    if (pages.length === 0) {
      post({ id, type: "error", message: `No readable content found in ${fileName}.` });
      return;
    }
    post({ id, type: "done", pages });
  } catch (error) {
    console.error(error);
    post({
      id,
      type: "error",
      message: `Couldn't read ${fileName}. The file may be corrupted or password-protected.`,
    });
  }
};

/* ------------------------------- PDF ------------------------------- */

type TextItemLike = { str: string; transform: number[]; width: number; height: number };

async function parsePdf(
  buffer: ArrayBuffer,
  onProgress: (page: number, total: number) => void,
): Promise<ParsedPage[]> {
  const pdfjs = await import("pdfjs-dist");
  const workerUrl = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url")).default;
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

  const loadingTask = pdfjs.getDocument({ data: buffer });
  const doc = await loadingTask.promise;
  const pages: ParsedPage[] = [];

  for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber++) {
    const page = await doc.getPage(pageNumber);
    const content = await page.getTextContent();
    const items = (content.items as TextItemLike[]).filter((item) => item.str.trim().length > 0);
    const textLength = items.reduce((sum, item) => sum + item.str.trim().length, 0);

    if (textLength >= SCAN_TEXT_THRESHOLD) {
      pages.push({ pageNumber, kind: "text", text: itemsToLines(items) });
    } else {
      // scanned page: render to JPEG for the multimodal model
      const viewport = page.getViewport({ scale: 1 });
      const scale = Math.min(2, MAX_IMAGE_WIDTH / viewport.width);
      const scaled = page.getViewport({ scale });
      const canvas = new OffscreenCanvas(Math.ceil(scaled.width), Math.ceil(scaled.height));
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Canvas unavailable");
      await page.render({
        canvas: canvas as unknown as HTMLCanvasElement,
        canvasContext: context as unknown as CanvasRenderingContext2D,
        viewport: scaled,
      }).promise;
      const blob = await canvas.convertToBlob({ type: "image/jpeg", quality: JPEG_QUALITY });
      pages.push({ pageNumber, kind: "image", imageBase64: await blobToBase64(blob) });
    }
    page.cleanup();
    onProgress(pageNumber, doc.numPages);
  }
  await loadingTask.destroy();
  return pages;
}

/** Cluster items into lines by y, order by x, mark column gaps with " | ". */
function itemsToLines(items: TextItemLike[]): string {
  type Positioned = { str: string; x: number; y: number; width: number; charWidth: number };
  const positioned: Positioned[] = items.map((item) => ({
    str: item.str,
    x: item.transform[4] ?? 0,
    y: item.transform[5] ?? 0,
    width: item.width,
    charWidth: item.str.length > 0 ? item.width / item.str.length : 4,
  }));

  const charWidths = positioned
    .map((p) => p.charWidth)
    .filter((w) => w > 0)
    .sort((a, b) => a - b);
  const medianCharWidth = charWidths[Math.floor(charWidths.length / 2)] ?? 5;
  const columnGap = Math.max(8, medianCharWidth * 1.5);

  // group into lines: sort by y desc, cluster with tolerance
  positioned.sort((a, b) => b.y - a.y || a.x - b.x);
  const lines: Positioned[][] = [];
  const yTolerance = 2.5;
  for (const item of positioned) {
    const line = lines[lines.length - 1];
    if (line && Math.abs((line[0]?.y ?? 0) - item.y) <= yTolerance) {
      line.push(item);
    } else {
      lines.push([item]);
    }
  }

  const rendered: string[] = [];
  for (const line of lines) {
    line.sort((a, b) => a.x - b.x);
    let text = "";
    let prevEnd: number | null = null;
    for (const item of line) {
      if (prevEnd !== null) {
        const gap = item.x - prevEnd;
        text += gap > columnGap ? " | " : " ";
      }
      text += item.str.trim();
      prevEnd = item.x + item.width;
    }
    if (text.trim().length > 0) rendered.push(text);
  }
  return rendered.join("\n");
}

/* ------------------------------ images ----------------------------- */

async function imageToPage(buffer: ArrayBuffer, pageNumber: number): Promise<ParsedPage> {
  const bitmap = await createImageBitmap(new Blob([buffer]));
  const scale = Math.min(1, MAX_IMAGE_WIDTH / bitmap.width);
  const canvas = new OffscreenCanvas(
    Math.max(1, Math.round(bitmap.width * scale)),
    Math.max(1, Math.round(bitmap.height * scale)),
  );
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas unavailable");
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const blob = await canvas.convertToBlob({ type: "image/jpeg", quality: JPEG_QUALITY });
  return { pageNumber, kind: "image", imageBase64: await blobToBase64(blob) };
}

async function blobToBase64(blob: Blob): Promise<string> {
  const buffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

/* ----------------------------- CSV/XLSX ---------------------------- */

function rowsToPages(rows: string[][], header: string[] | null): ParsedPage[] {
  const pages: ParsedPage[] = [];
  const headerLine = header ? header.join(" | ") : null;
  for (let start = 0; start < rows.length; start += CSV_ROWS_PER_PAGE) {
    const chunk = rows.slice(start, start + CSV_ROWS_PER_PAGE);
    const lines = chunk.map((row) => row.join(" | "));
    const text = headerLine ? [headerLine, ...lines].join("\n") : lines.join("\n");
    pages.push({ pageNumber: pages.length + 1, kind: "text", text });
  }
  return pages;
}

function parseCsvText(text: string): ParsedPage[] {
  return parseDelimited(text);
}

function parseDelimited(text: string): ParsedPage[] {
  const lines = text.split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (lines.length === 0) return [];
  const delimiter = detectDelimiter(lines[0] ?? "");
  const rows = lines.map((line) => splitCsvLine(line, delimiter));
  const header = rows[0] ?? null;
  return rowsToPages(rows.slice(1), header);
}

function detectDelimiter(line: string): string {
  const candidates = [",", ";", "\t", "|"];
  let best = ",";
  let bestCount = 0;
  for (const candidate of candidates) {
    const count = line.split(candidate).length - 1;
    if (count > bestCount) {
      best = candidate;
      bestCount = count;
    }
  }
  return best;
}

/** RFC-4180-ish splitter (quotes, escaped quotes) — enough for bank exports. */
function splitCsvLine(line: string, delimiter: string): string[] {
  const cells: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (inQuotes) {
      if (char === '"') {
        if (line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        current += char;
      }
    } else if (char === '"') {
      inQuotes = true;
    } else if (char === delimiter) {
      cells.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  cells.push(current.trim());
  return cells;
}

async function parseXlsx(buffer: ArrayBuffer): Promise<ParsedPage[]> {
  const ExcelJS = (await import("exceljs")).default;
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const sheet = workbook.worksheets[0];
  if (!sheet) return [];
  const rows: string[][] = [];
  sheet.eachRow((row) => {
    const values: string[] = [];
    row.eachCell({ includeEmpty: true }, (cell) => {
      values.push(cell.text ?? "");
    });
    if (values.some((v) => v.trim().length > 0)) rows.push(values);
  });
  const header = rows[0] ?? null;
  return rowsToPages(rows.slice(1), header);
}
