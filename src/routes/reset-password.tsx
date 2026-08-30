import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { CircleAlert } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { z } from "zod";

import { BrandMark } from "@/components/brand";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient, authErrorMessage } from "@/lib/auth-client";

const SearchSchema = z.object({
  token: z.string().optional(),
  error: z.string().optional(),
});

export const Route = createFileRoute("/reset-password")({
  validateSearch: SearchSchema,
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const navigate = useNavigate();
  const { token, error: tokenError } = Route.useSearch();
  const [pending, setPending] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const invalidLink = !token || tokenError === "INVALID_TOKEN";

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token) return;
    const form = new FormData(event.currentTarget);
    const newPassword = String(form.get("password"));
    if (newPassword.length < 12) {
      setFormError("Password must be at least 12 characters.");
      return;
    }
    if (newPassword !== String(form.get("confirm"))) {
      setFormError("The passwords don't match.");
      return;
    }
    setFormError(null);
    setPending(true);
    const { error } = await authClient.resetPassword({ newPassword, token });
    setPending(false);
    if (error) {
      setFormError(
        authErrorMessage(error, "Couldn't reset the password. The link may have expired."),
      );
      return;
    }
    toast.success("Password changed. Sign in with your new password");
    void navigate({ to: "/login" });
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm">
        <Link to="/" className="mb-6 flex items-center justify-center gap-2">
          <BrandMark size={30} />
          <span className="font-display text-2xl font-semibold tracking-tight">hishab</span>
        </Link>
        <Card>
          <CardHeader>
            <CardTitle>Choose a new password</CardTitle>
            <CardDescription>
              {invalidLink
                ? "This reset link is invalid or has expired."
                : "It signs you in on all your devices again."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {invalidLink ? (
              <p className="text-sm text-muted-foreground">
                Request a fresh one from the{" "}
                <Link to="/forgot-password" className="font-medium text-primary hover:underline">
                  reset page
                </Link>
                .
              </p>
            ) : (
              <form method="post" onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="password">New password</Label>
                  <Input
                    id="password"
                    name="password"
                    type="password"
                    autoComplete="new-password"
                    minLength={12}
                    required
                  />
                  <p className="text-xs text-muted-foreground">At least 12 characters.</p>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="confirm">Confirm new password</Label>
                  <Input
                    id="confirm"
                    name="confirm"
                    type="password"
                    autoComplete="new-password"
                    minLength={12}
                    required
                  />
                </div>
                {formError ? (
                  <div
                    role="alert"
                    className="flex items-start gap-2 rounded-md border border-negative/30 bg-negative/5 px-3 py-2 text-sm text-negative"
                  >
                    <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
                    <span>{formError}</span>
                  </div>
                ) : null}
                <Button type="submit" className="w-full" disabled={pending}>
                  {pending ? "Saving…" : "Set new password"}
                </Button>
              </form>
            )}
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
