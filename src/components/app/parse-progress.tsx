import { Check, CircleAlert, FileText, Image as ImageIcon, Loader2, Table2, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { UploadFileState } from "@/lib/extract/use-statement-upload";
import { cn } from "@/lib/utils";

function statusLine(file: UploadFileState): string {
  switch (file.status) {
    case "queued":
      return "Waiting…";
    case "parsing":
      return file.parseTotal > 0
        ? `Reading pages (${file.parsePage}/${file.parseTotal})`
        : "Reading file…";
    case "analyzing":
      switch (file.stage) {
        case "extracting":
          return file.extractTotal > 0
            ? `Reading transactions (${file.rowsFound} found · batch ${file.extractDone}/${file.extractTotal})`
            : "Reading transactions…";
        case "verifying":
          return "Checking the math…";
        case "categorizing":
          return "Categorizing…";
        case "checking_duplicates":
          return "Checking for duplicates…";
        default:
          return "Analyzing…";
      }
    case "ready":
      return `${file.draft?.rows.length ?? 0} transactions ready to review`;
    case "error":
      return file.error ?? "Something went wrong.";
  }
}

const TYPE_ICONS = { pdf: FileText, image: ImageIcon, csv: Table2, xlsx: Table2 } as const;

export function ParseProgressList({
  files,
  onReview,
  onRemove,
}: {
  files: UploadFileState[];
  onReview: (id: string) => void;
  onRemove: (id: string) => void;
}) {
  if (files.length === 0) return null;
  return (
    <ul className="divide-y rounded-lg border bg-card">
      {files.map((file) => {
        const TypeIcon = TYPE_ICONS[file.fileType];
        const working =
          file.status === "parsing" || file.status === "analyzing" || file.status === "queued";
        return (
          <li key={file.id} className="flex items-center gap-3 px-4 py-3">
            <TypeIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium">{file.fileName}</div>
              <div
                className={cn(
                  "truncate text-xs",
                  file.status === "error" ? "text-negative" : "text-muted-foreground",
                )}
              >
                {statusLine(file)}
              </div>
            </div>
            {working ? (
              <Loader2 className="size-4 shrink-0 animate-spin text-muted-foreground" />
            ) : null}
            {file.status === "error" ? (
              <CircleAlert className="size-4 shrink-0 text-negative" />
            ) : null}
            {file.status === "ready" ? (
              <>
                <Check className="size-4 shrink-0 text-positive" />
                <Button size="sm" onClick={() => onReview(file.id)}>
                  Review
                </Button>
              </>
            ) : null}
            {!working ? (
              <Button
                size="icon"
                variant="ghost"
                onClick={() => onRemove(file.id)}
                aria-label={`Remove ${file.fileName}`}
              >
                <X className="size-4" />
              </Button>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
