import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { CircleAlert, KeyRound } from "lucide-react";
import { useRef, useState } from "react";

import { BrandMark } from "@/components/brand";
import { RecoveryCodeCard } from "@/components/recovery-code-card";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient, authErrorMessage, signIn, twoFactor } from "@/lib/auth-client";
import { unlockWithPassword, unlockWithRecoveryCode } from "@/lib/key-store";

export const Route = createFileRoute("/login")({
  component: LoginPage,
});

type Step =
  | { kind: "credentials" }
  | { kind: "totp" }
  | { kind: "recovery" }
  | { kind: "show-recovery-code"; code: string };

function LoginPage() {
  const navigate = useNavigate();
  const [pending, setPending] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [step, setStep] = useState<Step>({ kind: "credentials" });
  const [method, setMethod] = useState<"totp" | "email" | "backup">("totp");
  const [emailCodeSent, setEmailCodeSent] = useState(false);

  // Held for the key ceremony that follows authentication; never sent anywhere
  // except better-auth's own sign-in call.
  const passwordRef = useRef("");
  const userIdRef = useRef("");

  /**
   * After authentication succeeds: unlock (or provision) the encryption key.
   * Nothing is encrypted with it yet, so every failure falls open into the
   * app rather than blocking the user.
   */
  async function finishSignIn() {
    const unlock = await unlockWithPassword(userIdRef.current, passwordRef.current);
    if (unlock.status === "created") {
      setStep({ kind: "show-recovery-code", code: unlock.recoveryCode });
      return;
    }
    if (unlock.status === "wrong_secret") {
      // The password changed (reset) since the key was wrapped — the recovery
      // code is the way back to the same key.
      setStep({ kind: "recovery" });
      return;
    }
    void navigate({ to: "/app" });
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const password = String(form.get("password"));
    setFormError(null);
    setPending(true);
    const { data, error } = await signIn.email({
      email: String(form.get("email")),
      password,
    });
    if (error) {
      setPending(false);
      setFormError(authErrorMessage(error, "Sign in failed. Check your email and password."));
      return;
    }
    passwordRef.current = password;
    if (data && "twoFactorRedirect" in data && data.twoFactorRedirect) {
      setPending(false);
      setStep({ kind: "totp" });
      return;
    }
    if (data && "user" in data) userIdRef.current = data.user.id;
    await finishSignIn();
    setPending(false);
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
    if (error) {
      setPending(false);
      setFormError(authErrorMessage(error, "That code didn't match. Try again."));
      return;
    }
    const { data: session } = await authClient.getSession();
    if (session) userIdRef.current = session.user.id;
    await finishSignIn();
    setPending(false);
  }

  async function handleRecoverySubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setFormError(null);
    setPending(true);
    const result = await unlockWithRecoveryCode(
      userIdRef.current,
      String(form.get("recovery")),
      passwordRef.current,
    );
    setPending(false);
    if (result.status === "created") {
      setStep({ kind: "show-recovery-code", code: result.recoveryCode });
      return;
    }
    if (result.status === "wrong_secret") {
      setFormError("That recovery code didn't match. Check it and try again.");
      return;
    }
    setFormError("Something went wrong. You can skip this for now and try again later.");
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

  if (step.kind === "show-recovery-code") {
    return (
      <Shell>
        <RecoveryCodeCard recoveryCode={step.code} onDone={() => void navigate({ to: "/app" })} />
      </Shell>
    );
  }

  if (step.kind === "recovery") {
    return (
      <Shell>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <KeyRound className="size-5 text-primary" aria-hidden />
              Unlock your data
            </CardTitle>
            <CardDescription>
              Your password changed, so your encryption key needs your recovery code — the one
              Hishab showed you when the key was created.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form method="post" onSubmit={handleRecoverySubmit} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="recovery">Recovery code</Label>
                <Input id="recovery" name="recovery" autoComplete="off" autoFocus required />
              </div>
              {formError ? <FormError message={formError} /> : null}
              <Button type="submit" className="w-full" disabled={pending}>
                {pending ? "Unlocking…" : "Unlock"}
              </Button>
              <button
                type="button"
                className="w-full text-center text-sm text-muted-foreground hover:text-foreground"
                onClick={() => void navigate({ to: "/app" })}
              >
                Skip for now
              </button>
            </form>
          </CardContent>
        </Card>
      </Shell>
    );
  }

  return (
    <Shell>
      <Card>
        <CardHeader>
          <CardTitle>{step.kind === "totp" ? "Two-factor code" : "Welcome back"}</CardTitle>
          <CardDescription>
            {step.kind === "totp"
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
          {step.kind === "totp" ? (
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
          {step.kind === "credentials" ? (
            <p className="mt-4 text-center text-sm text-muted-foreground">
              No account yet?{" "}
              <Link to="/signup" className="font-medium text-primary hover:underline">
                Create one
              </Link>
            </p>
          ) : null}
        </CardContent>
      </Card>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm">
        <Link to="/" className="mb-6 flex items-center justify-center gap-2">
          <BrandMark size={30} />
          <span className="font-display text-2xl font-semibold tracking-tight">hishab</span>
        </Link>
        {children}
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
