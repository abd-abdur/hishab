import { CheckCircle2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { formatMoney } from "@/lib/money";

/**
 * Miniature, real-component renderings of the three product truths — the same
 * primitives the app uses, fed believable AED demo values. Not screenshots:
 * they stay crisp at any zoom and follow the viewer's theme.
 */

const frame = "rounded-lg border bg-card p-3 text-left shadow-[var(--shadow-card)]";

export function ReviewPreview() {
  const rows = [
    { date: "03/07", merchant: "Carrefour MOE", amount: 32745 },
    { date: "05/07", merchant: "DEWA Payment", amount: 38620 },
    { date: "14/07", merchant: "ATM Withdrawal", amount: 100000 },
  ];
  return (
    <div className={frame} aria-hidden>
      <div className="mb-2 flex items-center gap-1.5">
        <Badge variant="outline" className="gap-1 text-[11px] text-positive">
          <CheckCircle2 className="size-3" />
          Balances reconcile
        </Badge>
        <span className="text-[11px] text-muted-foreground">19 transactions</span>
      </div>
      <div className="divide-y text-xs">
        {rows.map((row) => (
          <div key={row.merchant} className="flex items-center gap-2 py-1.5">
            <span className="num text-muted-foreground">{row.date}</span>
            <span className="min-w-0 flex-1 truncate font-medium">{row.merchant}</span>
            <span className="num text-negative">−{formatMoney(row.amount)}</span>
          </div>
        ))}
      </div>
      <div className="mt-2 rounded-md bg-primary px-3 py-1.5 text-center text-xs font-medium text-primary-foreground">
        Add 19 transactions
      </div>
    </div>
  );
}

export function RecurringPreview() {
  return (
    <div className={frame} aria-hidden>
      <div className="mb-2 text-xs font-medium">Recurring</div>
      <div className="divide-y text-xs">
        <div className="flex items-center justify-between gap-2 py-1.5">
          <span className="flex items-center gap-1.5 font-medium">
            Netflix
            <Badge variant="outline" className="text-[11px] text-warning">
              price change
            </Badge>
          </span>
          <span className="num text-muted-foreground">
            {formatMoney(3900)} → {formatMoney(4500)}
          </span>
        </div>
        <div className="flex items-center justify-between gap-2 py-1.5">
          <span className="font-medium">du</span>
          <span className="num text-muted-foreground">monthly · {formatMoney(32500)}</span>
        </div>
        <div className="flex items-center justify-between gap-2 py-1.5">
          <span className="font-medium">Spotify</span>
          <span className="num text-muted-foreground">monthly · {formatMoney(2199)}</span>
        </div>
      </div>
    </div>
  );
}

export function BudgetPreview() {
  return (
    <div className={frame} aria-hidden>
      <div className="mb-1 text-xs font-medium">Groceries</div>
      <div className="num text-lg font-semibold">
        {formatMoney(124000)}
        <span className="text-xs font-normal text-muted-foreground"> of {formatMoney(200000)}</span>
      </div>
      <div className="relative mt-2">
        <Progress value={62} />
        <div
          className="absolute top-1/2 h-3 w-0.5 -translate-y-1/2 bg-foreground/40"
          style={{ left: "60%" }}
        />
      </div>
      <p className="mt-1.5 text-xs text-muted-foreground">
        On track · projected ~{formatMoney(186000)}
      </p>
    </div>
  );
}
