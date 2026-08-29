import { cn } from "@/lib/utils";

/**
 * The hishab mark: a monoline "h" whose strokes double as a rising ledger
 * line. One weight, one color, drawn — not typed. Use `BrandMark` for the
 * tile and `Wordmark` for mark + name.
 */
export function BrandMark({ className, size = 28 }: { className?: string; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      role="img"
      aria-label="hishab"
      className={cn("shrink-0", className)}
    >
      <rect width="32" height="32" rx="7.5" fill="var(--primary)" />
      <g stroke="var(--primary-foreground)" strokeWidth="3.6" strokeLinecap="round" fill="none">
        {/* stem */}
        <path d="M11 24.5V7.5" />
        {/* shoulder and leg — the rising line */}
        <path d="M11 16.5c1.5-2.6 3.4-3.9 5.6-3.9 2.8 0 4.4 1.9 4.4 4.9v7" />
      </g>
    </svg>
  );
}

export function Wordmark({
  className,
  markSize = 28,
  textClassName = "text-xl",
}: {
  className?: string;
  markSize?: number;
  textClassName?: string;
}) {
  return (
    <span className={cn("flex items-center gap-2", className)}>
      <BrandMark size={markSize} />
      <span className={cn("font-display font-semibold tracking-tight", textClassName)}>hishab</span>
    </span>
  );
}
