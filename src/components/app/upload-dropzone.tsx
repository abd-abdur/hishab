import { FileUp } from "lucide-react";
import { useRef, useState } from "react";

import { cn } from "@/lib/utils";
import { MAX_FILES } from "@/lib/extract/use-statement-upload";

export function UploadDropzone({
  onFiles,
  disabled,
  compact,
}: {
  onFiles: (files: File[]) => void;
  disabled?: boolean;
  compact?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => inputRef.current?.click()}
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        onFiles(Array.from(e.dataTransfer.files));
      }}
      className={cn(
        "flex w-full flex-col items-center justify-center rounded-lg border-2 border-dashed bg-card text-center transition-colors",
        compact ? "px-4 py-6" : "px-6 py-14",
        dragging ? "border-primary bg-accent" : "border-border hover:border-primary/50",
        disabled && "cursor-not-allowed opacity-60",
      )}
    >
      <input
        ref={inputRef}
        type="file"
        multiple
        accept=".pdf,.csv,.xlsx,.xls,.txt,image/jpeg,image/png,image/webp,application/pdf"
        className="hidden"
        onChange={(e) => {
          if (e.target.files) onFiles(Array.from(e.target.files));
          e.target.value = "";
        }}
      />
      <FileUp className={cn("text-muted-foreground", compact ? "size-5" : "size-8")} aria-hidden />
      <p className={cn("font-medium", compact ? "mt-2 text-sm" : "mt-4 text-base")}>
        Drop bank statements here, or click to choose
      </p>
      <p className="mt-1 text-sm text-muted-foreground">
        PDF, photos of pages, CSV or Excel · up to {MAX_FILES} files at once, 15 MB each
      </p>
    </button>
  );
}
