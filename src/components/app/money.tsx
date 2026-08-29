import { cn } from "@/lib/utils";
import { formatMoney, formatSignedMoney } from "@/lib/money";

type MoneyProps = {
  /** Integer minor units (fils), always non-negative; direction carries the sign. */
  value: number;
  currency?: string;
  /** When set, renders −/+ prefix and the semantic money color. */
  direction?: "debit" | "credit";
  /**
   * Transfers between the user's own accounts: keep the sign (money did move)
   * but drop the gain/loss color — a card repayment is not income.
   */
  neutral?: boolean;
  className?: string;
};

/**
 * The only way money reaches JSX. Tabular numerals, en-AE currency format,
 * true minus sign, semantic colors for debits/credits.
 */
export function Money({ value, currency = "AED", direction, neutral, className }: MoneyProps) {
  if (direction) {
    return (
      <span
        className={cn(
          "num whitespace-nowrap",
          neutral
            ? "text-muted-foreground"
            : direction === "debit"
              ? "text-negative"
              : "text-positive",
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
