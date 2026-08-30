import { useVirtualizer } from "@tanstack/react-virtual";
import { memo, useMemo, useRef } from "react";

import { CategoryPicker, type CategoryOption } from "@/components/app/category-picker";
import { Money } from "@/components/app/money";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { formatDate } from "@/lib/money";
import { cn } from "@/lib/utils";

export type TransactionRow = {
  id: string;
  txnDate: string;
  description: string;
  merchantDisplay: string;
  merchantNorm: string;
  amountMinor: number;
  direction: "debit" | "credit";
  currency: string;
  categoryId: string;
  categorySource: "rule" | "dictionary" | "model" | "user";
  isAnomaly: boolean;
  anomalyFactor: number | null;
  matchedTransfer: boolean;
};

const ROW_HEIGHT = 48;

const Row = memo(function Row({
  row,
  categories,
  isTransfer,
  selected,
  onToggle,
  onCategoryChange,
}: {
  isTransfer: boolean;
  row: TransactionRow;
  categories: CategoryOption[];
  selected: boolean;
  onToggle: (id: string, shiftKey: boolean) => void;
  onCategoryChange: (row: TransactionRow, categoryId: string) => void;
}) {
  return (
    <div
      role="row"
      aria-selected={selected}
      className={cn("flex h-12 items-center gap-3 border-b px-3 text-sm", selected && "bg-accent")}
    >
      <span role="gridcell" className="flex shrink-0">
        <Checkbox
          checked={selected}
          onClick={(e) => onToggle(row.id, (e.nativeEvent as MouseEvent).shiftKey)}
          aria-label={`Select ${row.merchantDisplay}`}
        />
      </span>
      <span
        role="gridcell"
        className="num hidden w-20 shrink-0 text-xs text-muted-foreground sm:block"
      >
        {formatDate(row.txnDate)}
      </span>
      <span role="gridcell" className="min-w-0 flex-1" title={row.description}>
        <span className="block truncate font-medium">
          {row.merchantDisplay}
          {row.isAnomaly ? (
            <Badge
              variant="outline"
              className="ml-2 align-middle text-[11px] text-warning"
              title={
                row.anomalyFactor
                  ? `About ${row.anomalyFactor.toFixed(1)}× the typical charge in this category`
                  : "Well above the typical charge in this category"
              }
            >
              {row.anomalyFactor ? `${row.anomalyFactor.toFixed(1)}× usual` : "unusual"}
            </Badge>
          ) : null}
          {row.matchedTransfer ? (
            <Badge
              variant="outline"
              className="ml-2 align-middle text-[11px] text-muted-foreground"
              title="An opposite entry with the same amount exists in another of your statements — one internal move, seen from both accounts"
            >
              own move
            </Badge>
          ) : null}
        </span>
        <span className="num block truncate text-xs text-muted-foreground sm:hidden">
          {formatDate(row.txnDate)}
        </span>
      </span>
      {/* inline category editing — the row is the unit of correction */}
      <span role="gridcell" className="hidden w-44 shrink-0 md:block">
        <CategoryPicker
          categories={categories}
          value={row.categoryId}
          onChange={(categoryId) => onCategoryChange(row, categoryId)}
          size="sm"
        />
      </span>
      <span role="gridcell" className="w-28 shrink-0 text-right sm:w-32">
        <Money
          value={row.amountMinor}
          currency={row.currency}
          direction={row.direction}
          neutral={isTransfer}
          className="text-sm"
        />
      </span>
    </div>
  );
});

export function TransactionsTable({
  rows,
  categories,
  selection,
  allVisibleSelected,
  onToggle,
  onToggleAll,
  onCategoryChange,
  onEndReached,
  totalCount,
}: {
  rows: TransactionRow[];
  categories: CategoryOption[];
  selection: Set<string>;
  allVisibleSelected: boolean;
  onToggle: (id: string, shiftKey: boolean) => void;
  onToggleAll: () => void;
  onCategoryChange: (row: TransactionRow, categoryId: string) => void;
  onEndReached: () => void;
  totalCount: number;
}) {
  const parentRef = useRef<HTMLDivElement>(null);
  const transferIds = useMemo(
    () => new Set(categories.filter((c) => c.kind === "transfer").map((c) => c.id)),
    [categories],
  );
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 12,
  });

  return (
    <div role="grid" aria-rowcount={totalCount + 1} className="rounded-lg border bg-card">
      <div
        role="row"
        className="flex items-center gap-3 border-b bg-muted px-3 py-2 text-xs font-medium text-muted-foreground"
      >
        <span role="columnheader" className="flex shrink-0">
          <Checkbox
            checked={allVisibleSelected}
            onClick={onToggleAll}
            aria-label="Select all loaded transactions"
          />
        </span>
        <span role="columnheader" className="hidden w-20 shrink-0 sm:block">
          Date
        </span>
        <span role="columnheader" className="min-w-0 flex-1">
          Merchant
        </span>
        <span role="columnheader" className="hidden w-44 shrink-0 md:block">
          Category
        </span>
        <span role="columnheader" className="w-28 shrink-0 text-right sm:w-32">
          Amount
        </span>
      </div>
      <div
        ref={parentRef}
        className="h-[calc(100vh-300px)] overflow-auto pb-1"
        onScroll={(e) => {
          const el = e.currentTarget;
          if (el.scrollHeight - el.scrollTop - el.clientHeight < ROW_HEIGHT * 20) {
            onEndReached();
          }
        }}
      >
        <div style={{ height: virtualizer.getTotalSize(), position: "relative" }}>
          {virtualizer.getVirtualItems().map((virtualRow) => {
            const row = rows[virtualRow.index];
            if (!row) return null;
            return (
              <div
                key={row.id}
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: "100%",
                  transform: `translateY(${virtualRow.start}px)`,
                }}
              >
                <Row
                  row={row}
                  categories={categories}
                  isTransfer={transferIds.has(row.categoryId)}
                  selected={selection.has(row.id)}
                  onToggle={onToggle}
                  onCategoryChange={onCategoryChange}
                />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
