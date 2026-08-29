import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ArrowLeftRight, Download, Search, X } from "lucide-react";
import { useCallback, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { z } from "zod";

import { CategoryPicker } from "@/components/app/category-picker";
import { DateField } from "@/components/app/date-field";
import { EmptyState } from "@/components/app/empty-state";
import { PageHeader } from "@/components/app/page-header";
import { TransactionsTable, type TransactionRow } from "@/components/app/transactions-table";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { exportTransactionsFn, getCategoriesFn, getTransactionsFn } from "@/lib/app-data.functions";
import { recategorizeFn } from "@/lib/app-mutations.functions";
import { formatMoney } from "@/lib/money";

const PAGE_SIZE = 200;

const SearchSchema = z.object({
  q: z.string().optional(),
  cat: z.string().optional(),
  dir: z.enum(["debit", "credit"]).optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  statement: z.string().optional(),
});

export const Route = createFileRoute("/app/transactions")({
  validateSearch: SearchSchema,
  component: TransactionsPage,
});

function TransactionsPage() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const queryClient = useQueryClient();
  const [selection, setSelection] = useState<Set<string>>(new Set());
  const [bulkCategory, setBulkCategory] = useState("");
  const [createRule, setCreateRule] = useState(true);
  const [searchDraft, setSearchDraft] = useState(search.q ?? "");

  const filters = useMemo(
    () => ({
      q: search.q,
      categoryId: search.cat,
      direction: search.dir,
      from: search.from,
      to: search.to,
      statementId: search.statement,
    }),
    [search],
  );

  const { data: categories } = useQuery({
    queryKey: ["categories"],
    queryFn: () => getCategoriesFn(),
    staleTime: 300_000,
  });
  const categoriesById = useMemo(
    () => new Map((categories ?? []).map((c) => [c.id, { name: c.name, color: c.color }])),
    [categories],
  );
  const categoryOptions = useMemo(
    () => (categories ?? []).map((c) => ({ id: c.id, name: c.name, color: c.color, kind: c.kind })),
    [categories],
  );

  const query = useInfiniteQuery({
    queryKey: ["transactions", filters],
    queryFn: ({ pageParam }) =>
      getTransactionsFn({ data: { ...filters, offset: pageParam, limit: PAGE_SIZE } }),
    initialPageParam: 0,
    getNextPageParam: (lastPage, pages) => {
      const loaded = pages.reduce((sum, p) => sum + p.rows.length, 0);
      return loaded < lastPage.total ? loaded : undefined;
    },
    staleTime: 30_000,
  });

  const rows = useMemo(() => (query.data?.pages ?? []).flatMap((p) => p.rows), [query.data]);
  const summary = query.data?.pages[0];

  const setSearch = useCallback(
    (patch: Partial<z.infer<typeof SearchSchema>>) => {
      setSelection(new Set());
      void navigate({
        search: (prev) => {
          const next = { ...prev, ...patch };
          for (const key of Object.keys(next) as Array<keyof typeof next>) {
            if (!next[key]) delete next[key];
          }
          return next;
        },
      });
    },
    [navigate],
  );

  // shift-click selects the whole range from the last clicked row
  const anchorRef = useRef<string | null>(null);
  const toggle = useCallback(
    (id: string, shiftKey: boolean) => {
      setSelection((prev) => {
        const next = new Set(prev);
        if (shiftKey && anchorRef.current && anchorRef.current !== id) {
          const ids = rows.map((r) => r.id);
          const a = ids.indexOf(anchorRef.current);
          const b = ids.indexOf(id);
          if (a !== -1 && b !== -1) {
            const adding = !next.has(id);
            for (let i = Math.min(a, b); i <= Math.max(a, b); i++) {
              const rangeId = ids[i] as string;
              if (adding) next.add(rangeId);
              else next.delete(rangeId);
            }
            anchorRef.current = id;
            return next;
          }
        }
        if (next.has(id)) next.delete(id);
        else next.add(id);
        anchorRef.current = id;
        return next;
      });
    },
    [rows],
  );

  const allVisibleSelected = rows.length > 0 && rows.every((r) => selection.has(r.id));
  const toggleAll = useCallback(() => {
    setSelection((prev) => {
      if (rows.length > 0 && rows.every((r) => prev.has(r.id))) return new Set();
      return new Set(rows.map((r) => r.id));
    });
    anchorRef.current = null;
  }, [rows]);

  const recategorize = useMutation({
    mutationFn: recategorizeFn,
    onSuccess: (result) => {
      toast.success(
        result.ruleApplied > 0
          ? `${result.updated} updated · rule applied to ${result.ruleApplied} more`
          : `${result.updated} transactions updated`,
      );
      setSelection(new Set());
      setBulkCategory("");
      void queryClient.invalidateQueries();
    },
    onError: () => toast.error("Update failed. Try again."),
  });

  // inline single-row edit: apply immediately, offer the merchant rule as a follow-up
  const inlineRecategorize = useMutation({
    mutationFn: recategorizeFn,
    onError: () => {
      toast.error("Update failed. Try again.");
      void queryClient.invalidateQueries({ queryKey: ["transactions"] });
    },
  });
  const handleCategoryChange = useCallback(
    (row: TransactionRow, categoryId: string) => {
      if (categoryId === row.categoryId) return;
      // optimistic: patch every cached page so the row updates instantly
      queryClient.setQueriesData<typeof query.data>({ queryKey: ["transactions"] }, (data) =>
        data
          ? {
              ...data,
              pages: data.pages.map((page) => ({
                ...page,
                rows: page.rows.map((r) =>
                  r.id === row.id ? { ...r, categoryId, categorySource: "user" as const } : r,
                ),
              })),
            }
          : data,
      );
      inlineRecategorize.mutate(
        { data: { transactionIds: [row.id], categoryId, createRule: false } },
        {
          onSuccess: () => {
            const categoryName = categoriesById.get(categoryId)?.name ?? "category";
            toast.success(`${row.merchantDisplay} → ${categoryName}`, {
              action: {
                label: `Always use for ${row.merchantDisplay}`,
                onClick: () =>
                  recategorize.mutate({
                    data: { transactionIds: [row.id], categoryId, createRule: true },
                  }),
              },
            });
            void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
          },
        },
      );
    },
    [queryClient, inlineRecategorize, recategorize, categoriesById, query.data],
  );

  const exportCsv = useMutation({
    mutationFn: () => exportTransactionsFn({ data: { ...filters, offset: 0, limit: PAGE_SIZE } }),
    onSuccess: ({ csv, count }) => {
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = "hishab-transactions.csv";
      anchor.click();
      URL.revokeObjectURL(url);
      toast.success(`Exported ${count} transactions`);
    },
    onError: () => toast.error("Export failed. Try again."),
  });

  const hasFilters = Boolean(
    search.q || search.cat || search.dir || search.from || search.to || search.statement,
  );

  return (
    <>
      <PageHeader
        title="Transactions"
        description={
          summary
            ? `${summary.total} transactions · −${formatMoney(summary.totalDebitMinor, summary.currency)} · +${formatMoney(summary.totalCreditMinor, summary.currency)}`
            : undefined
        }
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={() => exportCsv.mutate()}
            disabled={exportCsv.isPending || rows.length === 0}
          >
            <Download className="size-4" />
            Export CSV
          </Button>
        }
      />
      <div className="space-y-3 p-4 md:p-6">
        <div className="flex flex-wrap items-center gap-2">
          <form
            className="relative"
            onSubmit={(e) => {
              e.preventDefault();
              setSearch({ q: searchDraft || undefined });
            }}
          >
            <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={searchDraft}
              onChange={(e) => setSearchDraft(e.target.value)}
              placeholder="Search merchants and descriptions"
              className="w-64 pl-8"
            />
          </form>
          <Select
            value={search.cat ?? "all"}
            onValueChange={(value) => setSearch({ cat: value === "all" ? undefined : value })}
          >
            <SelectTrigger className="w-44">
              <SelectValue placeholder="Category" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All categories</SelectItem>
              {categoryOptions.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={search.dir ?? "all"}
            onValueChange={(value) =>
              setSearch({ dir: value === "all" ? undefined : (value as "debit" | "credit") })
            }
          >
            <SelectTrigger className="w-32">
              <SelectValue placeholder="Direction" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="debit">Money out</SelectItem>
              <SelectItem value="credit">Money in</SelectItem>
            </SelectContent>
          </Select>
          <DateField
            value={search.from ?? ""}
            onChange={(iso) => setSearch({ from: iso || undefined })}
            label="From date"
            placeholder="From dd/mm/yyyy"
          />
          <DateField
            value={search.to ?? ""}
            onChange={(iso) => setSearch({ to: iso || undefined })}
            label="To date"
            placeholder="To dd/mm/yyyy"
          />
          {hasFilters ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setSearchDraft("");
                void navigate({ search: {} });
              }}
            >
              <X className="size-4" />
              Clear
            </Button>
          ) : null}
        </div>

        {selection.size > 0 ? (
          <div className="flex flex-wrap items-center gap-3 rounded-lg border bg-accent px-3 py-2">
            <span className="text-sm font-medium">{selection.size} selected</span>
            <CategoryPicker
              categories={categoryOptions}
              value={bulkCategory}
              onChange={setBulkCategory}
            />
            <Label className="flex items-center gap-1.5 text-sm font-normal">
              <Checkbox
                checked={createRule}
                onCheckedChange={(checked) => setCreateRule(checked === true)}
              />
              Always use for these merchants
            </Label>
            <Button
              size="sm"
              disabled={!bulkCategory || recategorize.isPending}
              onClick={() =>
                recategorize.mutate({
                  data: {
                    transactionIds: [...selection],
                    categoryId: bulkCategory,
                    createRule,
                  },
                })
              }
            >
              Apply
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setSelection(new Set())}>
              Cancel
            </Button>
          </div>
        ) : null}

        {query.isPending ? (
          <Skeleton className="h-96" />
        ) : rows.length === 0 ? (
          <EmptyState
            icon={ArrowLeftRight}
            title={hasFilters ? "Nothing matches these filters" : "No transactions yet"}
            description={
              hasFilters
                ? "Try widening the date range or clearing the search."
                : "Upload a statement and its transactions will appear here."
            }
          />
        ) : (
          <TransactionsTable
            rows={rows}
            categories={categoryOptions}
            selection={selection}
            allVisibleSelected={allVisibleSelected}
            onToggle={toggle}
            onToggleAll={toggleAll}
            onCategoryChange={handleCategoryChange}
            totalCount={summary?.total ?? rows.length}
            onEndReached={() => {
              if (query.hasNextPage && !query.isFetchingNextPage) void query.fetchNextPage();
            }}
          />
        )}
      </div>
    </>
  );
}
