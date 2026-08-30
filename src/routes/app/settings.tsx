import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Moon, Plus, ShieldCheck, Sun, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { PageHeader } from "@/components/app/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { getRulesFn } from "@/lib/app-data.functions";
import { decryptRows } from "@/lib/enc-data";
import { getStoredKeys } from "@/lib/key-store";
import { createCategoryFn, deleteRuleFn } from "@/lib/app-mutations.functions";
import { authErrorMessage, twoFactor, useSession } from "@/lib/auth-client";

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
    queryKey: ["rules", session.userId],
    queryFn: async () => {
      const rows = await getRulesFn();
      const keys = await getStoredKeys(session.userId);
      // Encrypted-era rules have a token pattern; show the decrypted name.
      const withDisplay = await decryptRows(keys, rows, ["patternDisplay"]);
      return withDisplay.map((r) => ({ ...r, label: r.patternDisplay ?? r.pattern }));
    },
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
    onError: () => toast.error("Couldn't create the category. Perhaps it already exists."),
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

        <TwoFactorCard />

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
                    <span className="min-w-0 flex-1 truncate font-medium">{rule.label}</span>
                    <span className="text-muted-foreground">→ {rule.categoryName}</span>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => deleteRule.mutate({ data: { ruleId: rule.id } })}
                      aria-label={`Delete rule for ${rule.label}`}
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

/**
 * TOTP two-factor auth. Enable shows the authenticator secret and one-time
 * backup codes; a first valid code confirms and switches it on.
 */
function TwoFactorCard() {
  const { data: sessionData, refetch } = useSession();
  const enabled = Boolean(
    sessionData?.user &&
    "twoFactorEnabled" in sessionData.user &&
    sessionData.user.twoFactorEnabled,
  );

  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [setup, setSetup] = useState<{ totpURI: string; backupCodes: string[] } | null>(null);
  const [code, setCode] = useState("");

  const totpSecret = setup ? (/[?&]secret=([^&]+)/.exec(setup.totpURI)?.[1] ?? "") : "";

  async function startEnable(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    const { data, error } = await twoFactor.enable({ password });
    setPending(false);
    if (error || !data || !("totpURI" in data)) {
      toast.error(authErrorMessage(error, "Couldn't start two-factor setup."));
      return;
    }
    setPassword("");
    setSetup({ totpURI: data.totpURI, backupCodes: data.backupCodes });
  }

  async function confirmEnable(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    const { error } = await twoFactor.verifyTotp({ code: code.replace(/\s+/g, "") });
    setPending(false);
    if (error) {
      toast.error(authErrorMessage(error, "That code didn't match. Try the current one."));
      return;
    }
    setSetup(null);
    setCode("");
    toast.success("Two-factor authentication is on");
    void refetch();
  }

  async function disable(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    const { error } = await twoFactor.disable({ password });
    setPending(false);
    if (error) {
      toast.error(authErrorMessage(error, "Couldn't turn off two-factor authentication."));
      return;
    }
    setPassword("");
    toast.success("Two-factor authentication is off");
    void refetch();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <ShieldCheck className="size-4" aria-hidden />
          Two-factor authentication
        </CardTitle>
        <CardDescription>
          {enabled
            ? "On. Signing in asks for a code from your authenticator app."
            : "Add a second step at sign-in using an authenticator app (Google Authenticator, 1Password, etc.)."}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {setup ? (
          <form onSubmit={confirmEnable} className="space-y-3 text-sm">
            <p>
              Add this key to your authenticator app, then enter the 6-digit code it shows to
              finish:
            </p>
            <div className="rounded-md border bg-muted/40 p-3">
              <div className="font-mono text-sm break-all select-all">{totpSecret}</div>
              <a
                href={setup.totpURI}
                className="mt-1 inline-block text-xs text-primary hover:underline"
              >
                Open in authenticator app
              </a>
            </div>
            <div className="space-y-1">
              <p className="font-medium">Backup codes</p>
              <p className="text-muted-foreground">
                Save these somewhere safe; each one signs you in once if you lose your
                authenticator.
              </p>
              <div className="grid grid-cols-2 gap-x-4 rounded-md border bg-muted/40 p-3 font-mono text-xs select-all">
                {setup.backupCodes.map((backupCode) => (
                  <span key={backupCode}>{backupCode}</span>
                ))}
              </div>
            </div>
            <div className="flex gap-2">
              <Input
                value={code}
                onChange={(e) => setCode(e.target.value)}
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder="6-digit code"
                required
              />
              <Button type="submit" disabled={pending || code.trim().length < 6}>
                {pending ? "Verifying…" : "Turn on"}
              </Button>
            </div>
          </form>
        ) : (
          <form onSubmit={enabled ? disable : startEnable} className="flex gap-2">
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              placeholder="Confirm your password"
              required
            />
            <Button
              type="submit"
              variant={enabled ? "outline" : "default"}
              disabled={pending || password.length === 0}
            >
              {pending ? "Working…" : enabled ? "Turn off" : "Turn on"}
            </Button>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
