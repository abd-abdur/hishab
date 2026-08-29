import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Moon, Plus, Sun, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { PageHeader } from "@/components/app/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { getRulesFn } from "@/lib/app-data.functions";
import { createCategoryFn, deleteRuleFn } from "@/lib/app-mutations.functions";

export const Route = createFileRoute("/app/settings")({
  component: SettingsPage,
});

function useDarkMode() {
  const [dark, setDark] = useState(
    () => typeof document !== "undefined" && document.documentElement.classList.contains("dark"),
  );
  const toggle = (next: boolean) => {
    setDark(next);
    document.documentElement.classList.toggle("dark", next);
    try {
      localStorage.setItem("hishab-theme", next ? "dark" : "light");
    } catch {
      /* private mode */
    }
  };
  return { dark, toggle };
}

function SettingsPage() {
  const queryClient = useQueryClient();
  const { dark, toggle } = useDarkMode();
  const [categoryName, setCategoryName] = useState("");
  const session = Route.useRouteContext({ select: (ctx) => ctx.session });

  const { data: rules } = useQuery({
    queryKey: ["rules"],
    queryFn: () => getRulesFn(),
    staleTime: 60_000,
  });

  const deleteRule = useMutation({
    mutationFn: deleteRuleFn,
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["rules"] }),
  });

  const createCategory = useMutation({
    mutationFn: createCategoryFn,
    onSuccess: () => {
      toast.success("Category created");
      setCategoryName("");
      void queryClient.invalidateQueries({ queryKey: ["categories"] });
    },
    onError: () => toast.error("Couldn't create the category — maybe it already exists."),
  });

  return (
    <>
      <PageHeader title="Settings" />
      <div className="grid max-w-2xl gap-4 p-4 md:p-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Account</CardTitle>
          </CardHeader>
          <CardContent className="text-sm">
            <div className="font-medium">{session.name}</div>
            <div className="text-muted-foreground">{session.email}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Appearance</CardTitle>
          </CardHeader>
          <CardContent>
            <Label className="flex items-center justify-between text-sm font-normal">
              <span className="flex items-center gap-2">
                {dark ? <Moon className="size-4" /> : <Sun className="size-4" />}
                Dark theme
              </span>
              <Switch checked={dark} onCheckedChange={toggle} />
            </Label>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Categories</CardTitle>
            <CardDescription>
              Add your own categories for anything the defaults miss.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (categoryName.trim().length >= 2) {
                  createCategory.mutate({ data: { name: categoryName.trim(), kind: "expense" } });
                }
              }}
            >
              <Input
                value={categoryName}
                onChange={(e) => setCategoryName(e.target.value)}
                placeholder="e.g. Kids, Pets, Charity"
              />
              <Button
                type="submit"
                disabled={categoryName.trim().length < 2 || createCategory.isPending}
              >
                <Plus className="size-4" />
                Add
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Merchant rules</CardTitle>
            <CardDescription>
              Created when you re-categorize and tick "always use for these merchants". Rules win
              over automatic categorization.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {(rules ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">No rules yet.</p>
            ) : (
              <div className="divide-y">
                {(rules ?? []).map((rule) => (
                  <div key={rule.id} className="flex items-center gap-3 py-2 text-sm">
                    <span className="min-w-0 flex-1 truncate font-medium">{rule.pattern}</span>
                    <span className="text-muted-foreground">→ {rule.categoryName}</span>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => deleteRule.mutate({ data: { ruleId: rule.id } })}
                      aria-label={`Delete rule for ${rule.pattern}`}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
