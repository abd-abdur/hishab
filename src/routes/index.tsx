import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowRight,
  BarChart3,
  FileText,
  Layers,
  Lock,
  PiggyBank,
  Sparkles,
  Upload,
  Wallet,
} from "lucide-react";

import { SiteFooter, SiteNav } from "@/components/site-nav";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Fiskal — AI spending analysis from your bank statement PDF" },
      {
        name: "description",
        content:
          "Drop in a bank statement PDF and Fiskal's AI turns it into categories, trends, recurring charges and savings tips in seconds.",
      },
      {
        property: "og:title",
        content: "Fiskal — AI spending analysis from your bank statement PDF",
      },
      {
        property: "og:description",
        content:
          "Turn any bank statement PDF into a clear spending dashboard with AI-powered insights.",
      },
    ],
  }),
  component: Landing,
});

const steps = [
  {
    icon: Upload,
    title: "Upload your statement",
    body: "Any bank, any layout. Drop in a PDF statement and we read every transaction line on your device.",
  },
  {
    icon: BarChart3,
    title: "Understand your habits",
    body: "AI categorises spending, spots recurring charges and charts income against expenses week by week.",
  },
  {
    icon: PiggyBank,
    title: "Spend stress-free",
    body: "Get a financial health score plus concrete actions with the money each one could save you monthly.",
  },
];

const features = [
  { icon: Layers, title: "Smart categories", body: "Groceries, rent, transport, subscriptions — grouped automatically with percentage splits." },
  { icon: Sparkles, title: "Written insights", body: "Plain-English observations about where your money actually goes each month." },
  { icon: FileText, title: "Recurring detector", body: "Surfaces standing orders and subscriptions quietly draining your account." },
  { icon: Wallet, title: "Cashflow view", body: "Income versus expenses over the statement period, at a glance." },
  { icon: PiggyBank, title: "Savings plan", body: "Prioritised recommendations with estimated monthly savings attached." },
  { icon: Lock, title: "Nothing stored", body: "Text is analysed in the request and never written to a database." },
];

function Landing() {
  return (
    <div className="min-h-screen">
      <SiteNav />

      <main>
        <section className="hero-surface">
          <div className="mx-auto grid max-w-6xl items-center gap-12 px-5 py-20 md:grid-cols-2 md:py-28">
            <div>
              <span className="inline-flex items-center gap-2 rounded-full border border-border bg-card/60 px-3 py-1 text-xs text-muted-foreground">
                <Sparkles className="size-3.5 text-primary" /> Powered by Gemini
              </span>
              <h1 className="mt-5 text-5xl font-bold leading-[1.05] md:text-6xl">
                The only app that gets your money into shape
              </h1>
              <p className="mt-5 max-w-md text-lg text-muted-foreground">
                Upload a bank statement PDF and get a full spending analysis — categories,
                trends, recurring charges and where to cut back.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Button asChild size="lg">
                  <Link to="/analyze">
                    Analyze my statement <ArrowRight className="size-4" />
                  </Link>
                </Button>
                <Button asChild size="lg" variant="secondary">
                  <a href="#how">See how it works</a>
                </Button>
              </div>
              <p className="mt-4 text-xs text-muted-foreground">
                No signup. No bank login. Just your PDF.
              </p>
            </div>

            <Card className="glass-card glow rounded-3xl p-6">
              <div className="flex items-baseline justify-between">
                <div>
                  <p className="text-xs uppercase tracking-widest text-muted-foreground">
                    Total expenses
                  </p>
                  <p className="font-display text-4xl font-bold">-1 574</p>
                </div>
                <span className="rounded-full bg-primary/15 px-3 py-1 text-xs text-primary">
                  Dec 1 – Dec 31
                </span>
              </div>
              <div className="mt-6 space-y-3">
                {[
                  ["Rent & housing", 24, "-620"],
                  ["Groceries", 22, "-346"],
                  ["Transport", 20, "-315"],
                  ["Dining", 15, "-236"],
                  ["Subscriptions", 13, "-57"],
                ].map(([label, pct, amount]) => (
                  <div key={label as string}>
                    <div className="flex justify-between text-sm">
                      <span>{label}</span>
                      <span className="text-muted-foreground">{amount} USD</span>
                    </div>
                    <div className="mt-1.5 h-2 rounded-full bg-secondary">
                      <div
                        className="h-2 rounded-full bg-primary"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-6 grid grid-cols-2 gap-3">
                <div className="rounded-xl bg-secondary/60 p-3">
                  <p className="text-xs text-muted-foreground">Avg. daily spend</p>
                  <p className="font-display text-xl font-semibold">-50.7</p>
                </div>
                <div className="rounded-xl bg-secondary/60 p-3">
                  <p className="text-xs text-muted-foreground">Busiest day</p>
                  <p className="font-display text-xl font-semibold">Thursday</p>
                </div>
              </div>
            </Card>
          </div>
        </section>

        <section id="how" className="mx-auto max-w-6xl px-5 py-20">
          <h2 className="max-w-lg text-4xl font-bold">
            How to get your money into shape?
          </h2>
          <div className="mt-10 grid gap-5 md:grid-cols-3">
            {steps.map((step, i) => (
              <Card key={step.title} className="glass-card rounded-2xl p-6">
                <span className="text-xs uppercase tracking-widest text-primary">
                  Step {i + 1}
                </span>
                <step.icon className="mt-4 size-6 text-primary" />
                <h3 className="mt-3 text-xl font-semibold">{step.title}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{step.body}</p>
              </Card>
            ))}
          </div>
        </section>

        <section id="features" className="border-y border-border/60 bg-card/30 py-20">
          <div className="mx-auto max-w-6xl px-5">
            <h2 className="text-4xl font-bold">Features people love</h2>
            <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {features.map((f) => (
                <div key={f.title} className="rounded-2xl border border-border p-6">
                  <f.icon className="size-5 text-primary" />
                  <h3 className="mt-3 text-lg font-semibold">{f.title}</h3>
                  <p className="mt-2 text-sm text-muted-foreground">{f.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="faq" className="mx-auto max-w-3xl px-5 py-20">
          <h2 className="text-4xl font-bold">Questions</h2>
          <Accordion type="single" collapsible className="mt-8">
            <AccordionItem value="a">
              <AccordionTrigger>Which banks are supported?</AccordionTrigger>
              <AccordionContent>
                Any bank. Fiskal reads the text of the PDF itself rather than connecting
                to your bank, so any text-based statement works.
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="b">
              <AccordionTrigger>Is my statement stored?</AccordionTrigger>
              <AccordionContent>
                No. The PDF is read in your browser and only the extracted text is sent for
                analysis. Nothing is written to a database.
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="c">
              <AccordionTrigger>What about scanned statements?</AccordionTrigger>
              <AccordionContent>
                Scanned image-only PDFs contain no selectable text, so export a digital
                statement from your banking app for best results.
              </AccordionContent>
            </AccordionItem>
          </Accordion>
          <Button asChild size="lg" className="mt-10">
            <Link to="/analyze">
              Analyze my statement <ArrowRight className="size-4" />
            </Link>
          </Button>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
