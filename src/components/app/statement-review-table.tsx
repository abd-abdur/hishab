import { CheckCircle2, CircleAlert } from "lucide-react";
import { useMemo } from "react";

import { CategoryPicker, type CategoryOption } from "@/components/app/category-picker";
import { Money } from "@/components/app/money";
import { Badge } from "@/components/ui/badge";
import type { DraftRow, DraftStatement } from "@/lib/ingest/draft-schema";
import { formatDate, formatMoney } from "@/lib/money";

/**
 * The trust step: every parsed row is shown and editable before anything is
 * saved. The reconciliation verdict is computed math, not model output.
 */
export function StatementReviewTable({
  statement,
  rows,
  categories,
  onRowsChange,
}: {
  statement: DraftStatement;
  rows: DraftRow[];
  categories: CategoryOption[];
  onRowsChange: (rows: DraftRow[]) => void;
}) {
  const duplicates = rows.filter((r) => r.duplicate).length;
  const totals = useMemo(() => {
    let debit = 0;
    let credit = 0;
    for (const row of rows) {
      if (row.direction === "debit") debit += row.amountMinor;
      else credit += row.amountMinor;
    }
    return { debit, credit };
  }, [rows]);

  const setCategory = (index: number, categoryId: string) => {
    onRowsChange(
      rows.map((row, i) =>
        i === index ? { ...row, categoryId, categorySource: "user" as const } : row,
      ),
    );
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        {statement.reconciliationStatus === "reconciled" ? (
          <Badge variant="outline" className="gap-1 text-positive">
            <CheckCircle2 className="size-3.5" />
            Balances reconcile
          </Badge>
        ) : statement.reconciliationStatus === "mismatch" ? (
          <Badge variant="outline" className="gap-1 text-warning">
            <CircleAlert className="size-3.5" />
            Off by{" "}
            {formatMoney(Math.abs(statement.reconciliationDeltaMinor ?? 0), statement.currency)} —
            check the rows
          </Badge>
        ) : (
          <Badge variant="outline" className="text-muted-foreground">
            No printed balances to check against
          </Badge>
        )}
        {statement.bankName ? <Badge variant="secondary">{statement.bankName}</Badge> : null}
        <Badge variant="secondary">{statement.currency}</Badge>
        {statement.periodStart && statement.periodEnd ? (
          <span className="text-muted-foreground">
            {formatDate(statement.periodStart)} – {formatDate(statement.periodEnd)}
          </span>
        ) : null}
        {duplicates > 0 ? (
          <span className="text-muted-foreground">
            {duplicates} row{duplicates === 1 ? "" : "s"} already in your account will be skipped
          </span>
        ) : null}
      </div>

      <div className="max-h-[52vh] overflow-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="sticky top-0 z-10 bg-muted text-left text-xs text-muted-foreground">
            <tr>
              <th className="px-3 py-2 font-medium">Date</th>
              <th className="px-3 py-2 font-medium">Description</th>
              <th className="px-3 py-2 font-medium">Category</th>
              <th className="px-3 py-2 text-right font-medium">Amount</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {rows.map((row, index) => (
              <tr key={row.dedupHash} className={row.duplicate ? "opacity-50" : undefined}>
                <td className="num whitespace-nowrap px-3 py-1.5 text-xs text-muted-foreground">
                  {formatDate(row.txnDate)}
                </td>
                <td className="max-w-72 px-3 py-1.5">
                  <div className="truncate font-medium">{row.merchantDisplay}</div>
                  <div className="flex items-center gap-1.5 truncate text-xs text-muted-foreground">
                    {row.description}
                    {row.duplicate ? (
                      <Badge variant="outline" className="shrink-0 text-[11px]">
                        already exists
                      </Badge>
                    ) : null}
                    {row.confidence < 1 ? (
                      <Badge variant="outline" className="shrink-0 text-[11px] text-warning">
                        check amount
                      </Badge>
                    ) : null}
                  </div>
                </td>
                <td className="px-3 py-1.5">
                  <CategoryPicker
                    categories={categories}
                    value={row.categoryId}
                    onChange={(categoryId) => setCategory(index, categoryId)}
                    size="sm"
                  />
                </td>
                <td className="px-3 py-1.5 text-right">
                  <Money
                    value={row.amountMinor}
                    currency={statement.currency}
                    direction={row.direction}
                  />
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot className="sticky bottom-0 bg-muted text-xs">
            <tr>
              <td colSpan={2} className="px-3 py-2 font-medium">
                {rows.length} transactions
              </td>
              <td className="px-3 py-2 text-right text-muted-foreground">totals</td>
              <td className="num px-3 py-2 text-right">
                <span className="text-negative">
                  −{formatMoney(totals.debit, statement.currency)}
                </span>{" "}
                <span className="text-positive">
                  +{formatMoney(totals.credit, statement.currency)}
                </span>
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
