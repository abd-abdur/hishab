import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { CircleAlert } from "lucide-react";
import { useState } from "react";

import { BrandMark } from "@/components/brand";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authErrorMessage, signIn, twoFactor } from "@/lib/auth-client";

export const Route = createFileRoute("/login")({
  component: LoginPage,
});

function LoginPage() {
  const navigate = useNavigate();
  const [pending, setPending] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [needsTotp, setNeedsTotp] = useState(false);
  const [method, setMethod] = useState<"totp" | "email" | "backup">("totp");
  const [emailCodeSent, setEmailCodeSent] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setFormError(null);
    setPending(true);
    const { data, error } = await signIn.email({
      email: String(form.get("email")),
      password: String(form.get("password")),
    });
    setPending(false);
    if (error) {
      setFormError(authErrorMessage(error, "Sign in failed. Check your email and password."));
      return;
    }
    if (data && "twoFactorRedirect" in data && data.twoFactorRedirect) {
      setNeedsTotp(true);
      return;
    }
    void navigate({ to: "/app" });
  }

  async function handleTotpSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const code = String(form.get("code")).replace(/\s+/g, "");
    setFormError(null);
    setPending(true);
    // trustDevice: this browser skips the code for the next 2 weeks
    const { error } =
      method === "backup"
        ? await twoFactor.verifyBackupCode({ code, trustDevice: true })
        : method === "email"
          ? await twoFactor.verifyOtp({ code, trustDevice: true })
          : await twoFactor.verifyTotp({ code, trustDevice: true });
    setPending(false);
    if (error) {
      setFormError(authErrorMessage(error, "That code didn't match. Try again."));
      return;
    }
    void navigate({ to: "/app" });
  }

  async function sendEmailCode() {
    setFormError(null);
    setPending(true);
    const { error } = await twoFactor.sendOtp();
    setPending(false);
    if (error) {
      setFormError(authErrorMessage(error, "Couldn't send the code. Try again."));
      return;
    }
    setMethod("email");
    setEmailCodeSent(true);
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
            <CardTitle>{needsTotp ? "Two-factor code" : "Welcome back"}</CardTitle>
            <CardDescription>
              {needsTotp
                ? method === "backup"
                  ? "Enter one of your backup codes"
                  : method === "email"
                    ? emailCodeSent
                      ? "We emailed you a 6-digit code"
                      : "Enter the code from your email"
                    : "Enter the 6-digit code from your authenticator app"
                : "Sign in to your account"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {needsTotp ? (
              <form method="post" onSubmit={handleTotpSubmit} className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="code">{method === "backup" ? "Backup code" : "Code"}</Label>
                  <Input
                    id="code"
                    name="code"
                    inputMode={method === "backup" ? "text" : "numeric"}
                    autoComplete="one-time-code"
                    autoFocus
                    required
                  />
                </div>
                {formError ? <FormError message={formError} /> : null}
                <Button type="submit" className="w-full" disabled={pending}>
                  {pending ? "Verifying…" : "Verify"}
                </Button>
                <p className="text-center text-xs text-muted-foreground">
                  This browser won't be asked again for 2 weeks.
                </p>
                <div className="flex flex-col gap-1.5">
                  {method !== "totp" ? (
                    <button
                      type="button"
                      className="w-full text-center text-sm text-muted-foreground hover:text-foreground"
                      onClick={() => {
                        setMethod("totp");
                        setFormError(null);
                      }}
                    >
                      Use authenticator code instead
                    </button>
                  ) : null}
                  {method !== "email" ? (
                    <button
                      type="button"
                      className="w-full text-center text-sm text-muted-foreground hover:text-foreground"
                      disabled={pending}
                      onClick={() => void sendEmailCode()}
                    >
                      Email me a code instead
                    </button>
                  ) : null}
                  {method !== "backup" ? (
                    <button
                      type="button"
                      className="w-full text-center text-sm text-muted-foreground hover:text-foreground"
                      onClick={() => {
                        setMethod("backup");
                        setFormError(null);
                      }}
                    >
                      Use a backup code instead
                    </button>
                  ) : null}
                </div>
              </form>
            ) : (
              /* method="post" keeps credentials out of the URL if a submit lands before hydration */
              <form method="post" onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="email">Email</Label>
                  <Input id="email" name="email" type="email" autoComplete="email" required />
                </div>
                <div className="space-y-1.5">
                  <div className="flex items-baseline justify-between">
                    <Label htmlFor="password">Password</Label>
                    <Link
                      to="/forgot-password"
                      className="text-xs text-muted-foreground hover:text-foreground"
                    >
                      Forgot password?
                    </Link>
                  </div>
                  <Input
                    id="password"
                    name="password"
                    type="password"
                    autoComplete="current-password"
                    required
                  />
                </div>
                {formError ? <FormError message={formError} /> : null}
                <Button type="submit" className="w-full" disabled={pending}>
                  {pending ? "Signing in…" : "Sign in"}
                </Button>
              </form>
            )}
            {!needsTotp ? (
              <p className="mt-4 text-center text-sm text-muted-foreground">
                No account yet?{" "}
                <Link to="/signup" className="font-medium text-primary hover:underline">
                  Create one
                </Link>
              </p>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </main>
  );
}

function FormError({ message }: { message: string }) {
  return (
    <div
      role="alert"
      className="flex items-start gap-2 rounded-md border border-negative/30 bg-negative/5 px-3 py-2 text-sm text-negative"
    >
      <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
      <span>{message}</span>
    </div>
  );
}
