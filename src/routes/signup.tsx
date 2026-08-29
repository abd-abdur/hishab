import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { CircleAlert } from "lucide-react";
import { useState } from "react";

import { BrandMark } from "@/components/brand";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authErrorMessage, isExistingAccountError, signUp } from "@/lib/auth-client";

export const Route = createFileRoute("/signup")({
  component: SignupPage,
});

type FormError = { message: string; existingAccount: boolean };

function SignupPage() {
  const navigate = useNavigate();
  const [pending, setPending] = useState(false);
  const [formError, setFormError] = useState<FormError | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const password = String(form.get("password"));
    if (password.length < 12) {
      setFormError({ message: "Password must be at least 12 characters.", existingAccount: false });
      return;
    }
    setFormError(null);
    setPending(true);
    const { error } = await signUp.email({
      name: String(form.get("name")),
      email: String(form.get("email")),
      password,
    });
    setPending(false);
    if (error) {
      setFormError({
        message: authErrorMessage(error, "Sign up failed. Please try again."),
        existingAccount: isExistingAccountError(error),
      });
      return;
    }
    void navigate({ to: "/app" });
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
            <CardTitle>Create your account</CardTitle>
            <CardDescription>
              Your statements stay yours — exportable and deletable.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {/* method="post" keeps credentials out of the URL if a submit lands before hydration */}
            <form method="post" onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="name">Name</Label>
                <Input id="name" name="name" autoComplete="name" required />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="email">Email</Label>
                <Input id="email" name="email" type="email" autoComplete="email" required />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="password">Password</Label>
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
              {formError ? (
                <div
                  role="alert"
                  className="flex items-start gap-2 rounded-md border border-negative/30 bg-negative/5 px-3 py-2 text-sm text-negative"
                >
                  <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
                  <span>
                    {formError.message}
                    {formError.existingAccount ? (
                      <>
                        {" "}
                        <Link to="/login" className="font-medium underline">
                          Sign in instead
                        </Link>
                        .
                      </>
                    ) : null}
                  </span>
                </div>
              ) : null}
              <p className="text-xs text-muted-foreground">
                By creating an account you agree to the{" "}
                <Link to="/terms" className="underline hover:text-foreground">
                  Terms
                </Link>{" "}
                and{" "}
                <Link to="/privacy" className="underline hover:text-foreground">
                  Privacy Policy
                </Link>
                .
              </p>
              <Button type="submit" className="w-full" disabled={pending}>
                {pending ? "Creating account…" : "Create account"}
              </Button>
            </form>
            <p className="mt-4 text-center text-sm text-muted-foreground">
              Already have an account?{" "}
              <Link to="/login" className="font-medium text-primary hover:underline">
                Sign in
              </Link>
            </p>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
