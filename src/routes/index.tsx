import "@fontsource-variable/fraunces";

import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, CalendarClock, CheckCircle2, SlidersHorizontal } from "lucide-react";

import { useSession } from "@/lib/auth-client";

import { CategoryDot } from "@/components/app/category-icon";
import { CategoryBars } from "@/components/charts/category-bars";
import { SpendSparkline } from "@/components/charts/spend-sparkline";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DEMO_CATEGORIES,
  DEMO_MONTH_LABEL,
  DEMO_RECURRING,
  DEMO_SPARKLINE,
  DEMO_TOTALS,
} from "@/lib/demo-data";
import { formatMoney } from "@/lib/money";

export const Route = createFileRoute("/")({
  component: LandingPage,
});

function Wordmark() {
  return (
    <Link to="/" className="flex items-center gap-2">
      <span className="flex size-7 items-center justify-center rounded-md bg-primary font-display text-base font-semibold text-primary-foreground">
        h
      </span>
      <span className="font-display text-xl font-semibold tracking-tight">hishab</span>
    </Link>
  );
}

function DashboardPreview() {
  return (
    <div className="rounded-xl border bg-card p-4 shadow-[var(--shadow-card)] sm:p-5">
      <div className="flex items-baseline justify-between">
        <div>
          <div className="text-sm text-muted-foreground">{DEMO_MONTH_LABEL} spend</div>
          <div className="num mt-0.5 text-3xl font-semibold tracking-tight">
            {formatMoney(DEMO_TOTALS.spendToDateMinor)}
          </div>
          <div className="mt-0.5 text-sm text-positive">
            {DEMO_TOTALS.paceVsPrevPct}% vs July at this point
          </div>
        </div>
        <div className="text-right text-sm">
          <div className="text-muted-foreground">Budgets</div>
          <div className="mt-0.5 font-medium">
            On track: {DEMO_TOTALS.budgetsOnTrack} of {DEMO_TOTALS.budgetsTotal}
          </div>
        </div>
      </div>
      <div className="mt-2">
        <SpendSparkline data={[...DEMO_SPARKLINE]} />
      </div>
      <div className="mt-5">
        <CategoryBars data={[...DEMO_CATEGORIES]} />
      </div>
      <div className="mt-5 border-t pt-4">
        <div className="mb-2 text-sm font-medium">Recurring next up</div>
        <div className="space-y-2">
          {DEMO_RECURRING.map((item) => (
            <div key={item.id} className="flex items-center justify-between gap-2 text-sm">
              <span className="flex items-center gap-2">
                {item.merchant}
                {item.priceChange ? (
                  <Badge variant="outline" className="text-[11px] text-warning">
                    price change
                  </Badge>
                ) : null}
              </span>
              <span className="text-muted-foreground">
                {item.nextDate} · <span className="num">{formatMoney(item.amountMinor)}</span>
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

const TRUTHS = [
  {
    icon: CheckCircle2,
    title: "You approve every row",
    body: "Statements are transcribed into individual transactions and shown to you first — editable, with duplicates flagged. Where a statement prints balances, Hishab checks that the rows add up to the fils and tells you when they don't.",
  },
  {
    icon: CalendarClock,
    title: "Subscriptions can't hide",
    body: "Recurring charges are detected from your actual history — cadence, next expected date, and price rises like a streaming plan quietly going from AED 39 to AED 45.",
  },
  {
    icon: SlidersHorizontal,
    title: "Budgets with an honest pace",
    body: 'Set a monthly limit per category and see a projection from your real pace — "on track to hit AED 1,860 of 2,000" — always labeled with how far your data actually goes.',
  },
];

const FAQS = [
  {
    q: "Which banks and formats work?",
    a: "Any bank. Hishab reads the statement itself — text PDFs, scanned pages, photos, CSV and Excel exports — rather than connecting to your bank. Up to 10 files at a time.",
  },
  {
    q: "What about currencies other than AED?",
    a: "The currency printed on each statement is respected. AED is the first-class default, with proper formatting for dirhams and fils.",
  },
  {
    q: "How accurate are the numbers?",
    a: "Transactions are transcribed row by row, then every total is computed arithmetic — nothing is estimated. When a statement prints opening and closing balances, Hishab reconciles against them and shows a verified badge (or an honest warning).",
  },
  {
    q: "What happens to my data?",
    a: "Your transactions are stored in your account so budgets and trends work across months and devices. Export everything as CSV or delete any statement — and its transactions — whenever you like. No bank logins, ever.",
  },
];

function LandingPage() {
  const { data: session } = useSession();
  const signedIn = Boolean(session?.user);

  return (
    <main className="min-h-screen bg-background">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4 sm:px-6">
        <Wordmark />
        <nav className="flex items-center gap-2">
          {signedIn ? (
            <Button asChild size="sm">
              <Link to="/app">
                Open your dashboard
                <ArrowRight className="size-4" />
              </Link>
            </Button>
          ) : (
            <>
              <Button asChild variant="ghost" size="sm">
                <Link to="/login">Sign in</Link>
              </Button>
              <Button asChild size="sm">
                <Link to="/signup">Start free</Link>
              </Button>
            </>
          )}
        </nav>
      </header>

      {/* Hero */}
      <section className="mx-auto grid max-w-6xl items-center gap-10 px-4 py-12 sm:px-6 lg:grid-cols-2 lg:py-20">
        <div>
          <h1 className="font-display text-4xl font-semibold leading-tight tracking-tight sm:text-5xl">
            Your statements, finally legible.
          </h1>
          <p className="mt-4 max-w-md text-lg text-muted-foreground">
            Upload a bank statement — PDF, a photo of a page, CSV or Excel. Hishab turns it into
            searchable transactions, budgets and trends. AED-first, fluent in any currency.
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            {signedIn ? (
              <Button asChild size="lg">
                <Link to="/app">
                  Open your dashboard
                  <ArrowRight className="size-4" />
                </Link>
              </Button>
            ) : (
              <>
                <Button asChild size="lg">
                  <Link to="/signup">
                    Start free
                    <ArrowRight className="size-4" />
                  </Link>
                </Button>
                <Button asChild size="lg" variant="outline">
                  <Link to="/login">Sign in</Link>
                </Button>
              </>
            )}
          </div>
          <p className="mt-4 text-sm text-muted-foreground">
            No bank logins. Every row reviewed by you before it counts.
          </p>
        </div>
        <DashboardPreview />
      </section>

      {/* Three product truths */}
      <section className="border-t bg-card/50">
        <div className="mx-auto grid max-w-6xl gap-8 px-4 py-14 sm:px-6 md:grid-cols-3">
          {TRUTHS.map((truth) => (
            <div key={truth.title}>
              <truth.icon className="size-5 text-primary" aria-hidden />
              <h2 className="mt-3 font-display text-xl font-semibold tracking-tight">
                {truth.title}
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{truth.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Data honesty */}
      <section className="mx-auto max-w-3xl px-4 py-14 sm:px-6">
        <h2 className="font-display text-2xl font-semibold tracking-tight">
          Straight answers about your data
        </h2>
        <div className="mt-4 space-y-3 text-[15px] leading-relaxed text-muted-foreground">
          <p>
            What's stored: the transactions you approve, in your account, so months compare and
            budgets carry over. All of it is exportable as CSV and deletable statement by statement.
          </p>
          <p>
            What's not: your bank credentials — Hishab never connects to your bank. Files you upload
            are processed to extract transactions and are not kept as documents. Your data is not
            sold or shared.
          </p>
          <p>
            Categorization is automatic and correctable — fix a merchant once and Hishab remembers
            your choice for every future statement.
          </p>
        </div>
      </section>

      {/* FAQ */}
      <section className="border-t">
        <div className="mx-auto max-w-3xl px-4 py-14 sm:px-6">
          <h2 className="font-display text-2xl font-semibold tracking-tight">Questions</h2>
          <dl className="mt-6 space-y-6">
            {FAQS.map((faq) => (
              <div key={faq.q}>
                <dt className="text-[15px] font-medium">{faq.q}</dt>
                <dd className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{faq.a}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      <footer className="border-t">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-8 text-sm text-muted-foreground sm:px-6">
          <div className="flex items-center gap-2">
            <span className="flex size-5 items-center justify-center rounded bg-primary font-display text-xs font-semibold text-primary-foreground">
              h
            </span>
            hishab — every dirham, accounted for
          </div>
          <div className="flex items-center gap-1.5">
            <CategoryDot color="chart-1" />
            AED-first · any currency
          </div>
        </div>
      </footer>
    </main>
  );
}
