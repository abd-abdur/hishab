import { useVirtualizer } from "@tanstack/react-virtual";
import { memo, useRef } from "react";

import { CategoryDot } from "@/components/app/category-icon";
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
};

type CategoryMeta = { name: string; color: string };

const ROW_HEIGHT = 44;

const Row = memo(function Row({
  row,
  category,
  selected,
  onToggle,
}: {
  row: TransactionRow;
  category: CategoryMeta | undefined;
  selected: boolean;
  onToggle: (id: string, shiftKey: boolean) => void;
}) {
  return (
    <div
      className={cn("flex h-11 items-center gap-3 border-b px-3 text-sm", selected && "bg-accent")}
    >
      <Checkbox
        checked={selected}
        onClick={(e) => onToggle(row.id, (e.nativeEvent as MouseEvent).shiftKey)}
        aria-label={`Select ${row.merchantDisplay}`}
      />
      <span className="num w-20 shrink-0 text-xs text-muted-foreground">
        {formatDate(row.txnDate)}
      </span>
      <span className="min-w-0 flex-1 truncate" title={row.description}>
        <span className="font-medium">{row.merchantDisplay}</span>
        {row.isAnomaly ? (
          <Badge variant="outline" className="ml-2 text-[10px] text-warning">
            unusual
          </Badge>
        ) : null}
      </span>
      <span className="hidden w-36 shrink-0 items-center gap-1.5 truncate text-xs text-muted-foreground sm:flex">
        {category ? (
          <>
            <CategoryDot color={category.color} />
            {category.name}
          </>
        ) : null}
      </span>
      <span className="w-32 shrink-0 text-right">
        <Money
          value={row.amountMinor}
          currency={row.currency}
          direction={row.direction}
          className="text-sm"
        />
      </span>
    </div>
  );
});

export function TransactionsTable({
  rows,
  categoriesById,
  selection,
  onToggle,
  onEndReached,
}: {
  rows: TransactionRow[];
  categoriesById: Map<string, CategoryMeta>;
  selection: Set<string>;
  onToggle: (id: string, shiftKey: boolean) => void;
  onEndReached: () => void;
}) {
  const parentRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 12,
  });

  return (
    <div
      ref={parentRef}
      className="h-[calc(100vh-260px)] overflow-auto rounded-lg border bg-card"
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
                category={categoriesById.get(row.categoryId)}
                selected={selection.has(row.id)}
                onToggle={onToggle}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
