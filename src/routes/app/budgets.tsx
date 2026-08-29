import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { PiggyBank, Plus, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { CategoryIcon } from "@/components/app/category-icon";
import { CategoryPicker } from "@/components/app/category-picker";
import { EmptyState } from "@/components/app/empty-state";
import { PageHeader } from "@/components/app/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { getBudgetsFn, getCategoriesFn } from "@/lib/app-data.functions";
import { deleteBudgetFn, upsertBudgetFn } from "@/lib/app-mutations.functions";
import { formatMoney } from "@/lib/money";

export const Route = createFileRoute("/app/budgets")({
  component: BudgetsPage,
});

function BudgetsPage() {
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [categoryId, setCategoryId] = useState("");
  const [amount, setAmount] = useState("");

  const { data: budgets, isPending } = useQuery({
    queryKey: ["budgets"],
    queryFn: () => getBudgetsFn(),
    staleTime: 30_000,
  });
  const { data: categories } = useQuery({
    queryKey: ["categories"],
    queryFn: () => getCategoriesFn(),
    staleTime: 300_000,
  });

  const budgetedIds = useMemo(() => new Set((budgets ?? []).map((b) => b.categoryId)), [budgets]);
  const availableCategories = useMemo(
    () =>
      (categories ?? [])
        .filter((c) => c.kind === "expense" && !budgetedIds.has(c.id))
        .map((c) => ({ id: c.id, name: c.name, color: c.color, kind: c.kind })),
    [categories, budgetedIds],
  );

  const upsert = useMutation({
    mutationFn: upsertBudgetFn,
    onSuccess: () => {
      toast.success("Budget saved");
      setDialogOpen(false);
      setCategoryId("");
      setAmount("");
      void queryClient.invalidateQueries({ queryKey: ["budgets"] });
      void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
    onError: () => toast.error("Couldn't save the budget."),
  });

  const remove = useMutation({
    mutationFn: deleteBudgetFn,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["budgets"] });
      void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });

  const dayOfMonth = new Date().getDate();
  const daysInMonth = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate();
  const monthPct = (dayOfMonth / daysInMonth) * 100;

  return (
    <>
      <PageHeader
        title="Budgets"
        description="Monthly targets with an honest pace check."
        actions={
          <Button size="sm" onClick={() => setDialogOpen(true)}>
            <Plus className="size-4" />
            Add budget
          </Button>
        }
      />
      <div className="p-4 md:p-6">
        {isPending ? (
          <Skeleton className="h-64" />
        ) : (budgets ?? []).length === 0 ? (
          <EmptyState
            icon={PiggyBank}
            title="No budgets yet"
            description="Set a monthly limit per category and Hishab projects whether you're on track from your actual pace."
          >
            <Button onClick={() => setDialogOpen(true)}>
              <Plus className="size-4" />
              Add your first budget
            </Button>
          </EmptyState>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {(budgets ?? []).map((budget) => {
              const usedPct = Math.min(100, (budget.spentMinor / budget.limitMinor) * 100);
              const over = budget.spentMinor > budget.limitMinor;
              const pacingOver = !over && budget.projectedMinor > budget.limitMinor;
              return (
                <Card key={budget.budgetId}>
                  <CardContent className="pt-5">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2 font-medium">
                        <CategoryIcon icon={budget.icon} color={budget.color} />
                        {budget.categoryName}
                      </div>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="-mr-2 -mt-1"
                        onClick={() => remove.mutate({ data: { budgetId: budget.budgetId } })}
                        aria-label={`Delete ${budget.categoryName} budget`}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                    <div className="num mt-3 text-xl font-semibold">
                      {formatMoney(budget.spentMinor, budget.currency)}
                      <span className="text-sm font-normal text-muted-foreground">
                        {" "}
                        of {formatMoney(budget.limitMinor, budget.currency)}
                      </span>
                    </div>
                    <div className="relative mt-3">
                      <Progress
                        value={usedPct}
                        className={
                          over ? "[&>div]:bg-negative" : pacingOver ? "[&>div]:bg-warning" : ""
                        }
                      />
                      <div
                        className="absolute top-1/2 h-3 w-0.5 -translate-y-1/2 bg-foreground/40"
                        style={{ left: `${monthPct}%` }}
                        title="Where the month is"
                      />
                    </div>
                    <p
                      className={`mt-2 text-sm ${
                        over
                          ? "text-negative"
                          : pacingOver
                            ? "text-warning"
                            : "text-muted-foreground"
                      }`}
                    >
                      {over
                        ? `Over by ${formatMoney(budget.spentMinor - budget.limitMinor, budget.currency)}`
                        : pacingOver
                          ? `On pace to hit ~${formatMoney(budget.projectedMinor, budget.currency)}`
                          : `On track · projected ~${formatMoney(budget.projectedMinor, budget.currency)}`}
                    </p>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Add budget</DialogTitle>
            <DialogDescription>A monthly limit for one category.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Category</Label>
              <CategoryPicker
                categories={availableCategories}
                value={categoryId}
                onChange={setCategoryId}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="budget-amount">Monthly limit</Label>
              <Input
                id="budget-amount"
                type="number"
                min="1"
                step="1"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="2000"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={!categoryId || !amount || Number(amount) <= 0 || upsert.isPending}
              onClick={() =>
                upsert.mutate({
                  data: { categoryId, monthlyLimitMinor: Math.round(Number(amount) * 100) },
                })
              }
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
