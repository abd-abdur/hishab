import { cn } from "@/lib/utils";
import { formatMoney, formatSignedMoney } from "@/lib/money";

type MoneyProps = {
  /** Integer minor units (fils), always non-negative; direction carries the sign. */
  value: number;
  currency?: string;
  /** When set, renders −/+ prefix and the semantic money color. */
  direction?: "debit" | "credit";
  className?: string;
};

/**
 * The only way money reaches JSX. Tabular numerals, en-AE currency format,
 * true minus sign, semantic colors for debits/credits.
 */
export function Money({ value, currency = "AED", direction, className }: MoneyProps) {
  if (direction) {
    return (
      <span
        className={cn(
          "num whitespace-nowrap",
          direction === "debit" ? "text-negative" : "text-positive",
          className,
        )}
      >
        {formatSignedMoney(value, direction, currency)}
      </span>
    );
  }
  return (
    <span className={cn("num whitespace-nowrap", className)}>{formatMoney(value, currency)}</span>
  );
}
