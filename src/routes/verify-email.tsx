import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { CircleAlert, MailCheck } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { BrandMark } from "@/components/brand";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { signOut, useSession } from "@/lib/auth-client";
import { confirmReverifyCodeFn, requestReverifyCodeFn } from "@/lib/reverify.functions";

export const Route = createFileRoute("/verify-email")({
  component: VerifyEmailPage,
});

/**
 * Every 7 days a sign-in must be re-confirmed with a 6-digit emailed code.
 * The /app guard redirects here; entering the code restarts the clock.
 */
function VerifyEmailPage() {
  const navigate = useNavigate();
  const { data: sessionData } = useSession();
  const email = sessionData?.user.email;

  const [pending, setPending] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const sentOnce = useRef(false);

  // Send the code as soon as the page loads; the server ignores duplicates
  // within its cooldown, so a refresh can't spam the inbox.
  useEffect(() => {
    if (sentOnce.current) return;
    sentOnce.current = true;
    void requestReverifyCodeFn().catch(() => {
      setNotice("Couldn't send the code automatically. Use the resend button.");
    });
  }, []);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const code = String(form.get("code")).replace(/\s+/g, "");
    setFormError(null);
    setPending(true);
    try {
      const result = await confirmReverifyCodeFn({ data: { code } });
      if (!result.ok) {
        setFormError(
          result.error === "mismatch"
            ? "That code didn't match. Check the latest email and try again."
            : "That code has expired. We can send you a fresh one.",
        );
        return;
      }
      void navigate({ to: "/app" });
    } finally {
      setPending(false);
    }
  }

  async function resend() {
    setFormError(null);
    setPending(true);
    try {
      await requestReverifyCodeFn();
      setNotice("Sent. Check your inbox.");
    } catch {
      setNotice("Couldn't send the code. Try again in a minute.");
    } finally {
      setPending(false);
    }
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
            <CardTitle className="flex items-center gap-2">
              <MailCheck className="size-5 text-primary" aria-hidden />
              Confirm it's still you
            </CardTitle>
            <CardDescription>
              For your security, Hishab re-confirms your email every 7 days. We've sent a 6-digit
              code{email ? ` to ${email}` : ""}.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form method="post" onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="code">Code</Label>
                <Input
                  id="code"
                  name="code"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={7}
                  autoFocus
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
              {notice ? <p className="text-sm text-muted-foreground">{notice}</p> : null}
              <Button type="submit" className="w-full" disabled={pending}>
                {pending ? "Checking…" : "Confirm"}
              </Button>
              <div className="flex flex-col gap-1.5">
                <button
                  type="button"
                  className="w-full text-center text-sm text-muted-foreground hover:text-foreground"
                  disabled={pending}
                  onClick={() => void resend()}
                >
                  Resend the code
                </button>
                <button
                  type="button"
                  className="w-full text-center text-sm text-muted-foreground hover:text-foreground"
                  onClick={() => void signOut().then(() => window.location.assign("/login"))}
                >
                  Sign out
                </button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
