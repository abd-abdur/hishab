import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation } from "@tanstack/react-query";
import { AlertTriangle, FileUp, Loader2, RefreshCw, Sparkles } from "lucide-react";
import { useRef, useState } from "react";
import {
  Area,
  AreaChart,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { SiteFooter, SiteNav } from "@/components/site-nav";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { analyzeStatement, type SpendingAnalysis } from "@/lib/analyze.functions";
import { extractPdfText } from "@/lib/pdf-text";

export const Route = createFileRoute("/analyze")({
  head: () => ({
    meta: [
      { title: "Analyze a bank statement PDF — Fiskal" },
      {
        name: "description",
        content:
          "Upload your bank statement PDF and get an AI spending dashboard: categories, cashflow, recurring charges and savings tips.",
      },
      { property: "og:title", content: "Analyze a bank statement PDF — Fiskal" },
      {
        property: "og:description",
        content: "AI-powered spending analysis from any bank statement PDF.",
      },
    ],
  }),
  component: AnalyzePage,
});

const CHART_COLORS = [
  "var(--color-chart-1)",
  "var(--color-chart-2)",
  "var(--color-chart-3)",
  "var(--color-chart-4)",
  "var(--color-chart-5)",
  "var(--color-chart-6)",
];

function AnalyzePage() {
  const runAnalysis = useServerFn(analyzeStatement);
  const [fileName, setFileName] = useState<string | null>(null);
  const [stage, setStage] = useState<string>("");
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const mutation = useMutation({
    mutationFn: async (file: File) => {
      setFileName(file.name);
      setStage("Reading your PDF…");
      const text = await extractPdfText(file);
      if (text.replace(/\s/g, "").length < 80) {
        throw new Error(
          "No readable text found in this PDF. It looks like a scan — export a digital statement from your bank instead.",
        );
      }
      setStage("Analyzing transactions with AI…");
      return (await runAnalysis({ data: { text } })) as SpendingAnalysis;
    },
    onSettled: () => setStage(""),
  });

  function handleFile(file?: File | null) {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".pdf")) {
      mutation.reset();
      return;
    }
    mutation.mutate(file);
  }

  const data = mutation.data;

  return (
    <div className="min-h-screen">
      <SiteNav />
      <main className="hero-surface">
        <div className="mx-auto max-w-6xl px-5 py-14">
          <h1 className="text-4xl font-bold md:text-5xl">Your spending analysis</h1>
          <p className="mt-3 max-w-xl text-muted-foreground">
            Upload a bank or card statement PDF. Fiskal reads it in your browser and turns
            it into a full breakdown of where your money went.
          </p>

          <Card
            className={`glass-card mt-8 rounded-3xl border-dashed p-10 text-center transition-colors ${
              dragging ? "border-primary bg-primary/5" : ""
            }`}
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              handleFile(e.dataTransfer.files?.[0]);
            }}
          >
            <input
              ref={inputRef}
              type="file"
              accept="application/pdf"
              className="hidden"
              onChange={(e) => handleFile(e.target.files?.[0])}
            />
            <FileUp className="mx-auto size-8 text-primary" />
            <p className="mt-4 font-display text-lg font-semibold">
              {fileName ?? "Drop your statement PDF here"}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              Text-based PDFs from any bank, up to a few hundred pages.
            </p>
            <div className="mt-6 flex flex-wrap justify-center gap-3">
              <Button onClick={() => inputRef.current?.click()} disabled={mutation.isPending}>
                {mutation.isPending ? (
                  <>
                    <Loader2 className="size-4 animate-spin" /> {stage || "Working…"}
                  </>
                ) : (
                  <>Choose PDF</>
                )}
              </Button>
              {data && !mutation.isPending && (
                <Button variant="secondary" onClick={() => inputRef.current?.click()}>
                  <RefreshCw className="size-4" /> Analyze another
                </Button>
              )}
            </div>
          </Card>

          {mutation.isError && (
            <Card className="glass-card mt-6 flex items-start gap-3 rounded-2xl border-destructive/50 p-5">
              <AlertTriangle className="mt-0.5 size-5 text-destructive" />
              <div>
                <p className="font-semibold">We couldn't analyze that statement</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {(mutation.error as Error).message}
                </p>
              </div>
            </Card>
          )}

          {data && <Dashboard data={data} />}
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}

function money(value: number, currency: string) {
  const rounded = Math.round(Math.abs(value)).toLocaleString("en-US");
  return `${value < 0 ? "-" : ""}${rounded} ${currency}`;
}

function Dashboard({ data }: { data: SpendingAnalysis }) {
  const c = data.currency || "USD";

  return (
    <div className="mt-12 space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold">
            {data.bankName || "Statement"} · {data.accountLabel}
          </h2>
          <p className="text-sm text-muted-foreground">
            {data.periodLabel} · {data.transactionCount} transactions
          </p>
        </div>
        <div className="rounded-full border border-border bg-card/60 px-4 py-2 text-sm">
          Health score{" "}
          <span className="font-display font-bold text-primary">
            {Math.round(data.healthScore)}/100
          </span>{" "}
          · {data.healthVerdict}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Total expenses" value={money(-data.totalExpenses, c)} tone="down" />
        <Stat label="Total income" value={money(data.totalIncome, c)} tone="up" />
        <Stat
          label="Net cashflow"
          value={money(data.netCashflow, c)}
          tone={data.netCashflow >= 0 ? "up" : "down"}
        />
        <Stat label="Avg. daily spend" value={money(-data.averageDailySpend, c)} />
      </div>

      <div className="grid gap-6 lg:grid-cols-5">
        <Card className="glass-card rounded-2xl p-6 lg:col-span-3">
          <h3 className="text-lg font-semibold">Cashflow over the period</h3>
          <div className="mt-4 h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data.timeline}>
                <defs>
                  <linearGradient id="inc" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--color-chart-1)" stopOpacity={0.5} />
                    <stop offset="100%" stopColor="var(--color-chart-1)" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="exp" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--color-chart-4)" stopOpacity={0.5} />
                    <stop offset="100%" stopColor="var(--color-chart-4)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 12, fill: "var(--color-muted-foreground)" }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fontSize: 12, fill: "var(--color-muted-foreground)" }}
                  axisLine={false}
                  tickLine={false}
                  width={48}
                />
                <Tooltip
                  contentStyle={{
                    background: "var(--color-popover)",
                    border: "1px solid var(--color-border)",
                    borderRadius: 12,
                    color: "var(--color-popover-foreground)",
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="income"
                  stroke="var(--color-chart-1)"
                  fill="url(#inc)"
                  strokeWidth={2}
                />
                <Area
                  type="monotone"
                  dataKey="expenses"
                  stroke="var(--color-chart-4)"
                  fill="url(#exp)"
                  strokeWidth={2}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card className="glass-card rounded-2xl p-6 lg:col-span-2">
          <h3 className="text-lg font-semibold">Where your money goes</h3>
          <div className="mt-2 h-44">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={data.categories}
                  dataKey="amount"
                  nameKey="name"
                  innerRadius={48}
                  outerRadius={72}
                  paddingAngle={3}
                  stroke="none"
                >
                  {data.categories.map((_, i) => (
                    <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    background: "var(--color-popover)",
                    border: "1px solid var(--color-border)",
                    borderRadius: 12,
                    color: "var(--color-popover-foreground)",
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-3 space-y-3">
            {data.categories.map((cat, i) => (
              <div key={cat.name}>
                <div className="flex justify-between text-sm">
                  <span className="flex items-center gap-2">
                    <span
                      className="size-2.5 rounded-full"
                      style={{ background: CHART_COLORS[i % CHART_COLORS.length] }}
                    />
                    {cat.name}
                  </span>
                  <span className="text-muted-foreground">
                    {money(cat.amount, c)} · {cat.percentage}%
                  </span>
                </div>
                <Progress value={cat.percentage} className="mt-1.5 h-1.5" />
              </div>
            ))}
          </div>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="glass-card rounded-2xl p-6">
          <h3 className="text-lg font-semibold">Top merchants</h3>
          <ul className="mt-4 divide-y divide-border">
            {data.topMerchants.map((m) => (
              <li key={m.name} className="flex items-center justify-between py-3 text-sm">
                <span>
                  {m.name}
                  <span className="ml-2 text-xs text-muted-foreground">
                    {m.count} transactions
                  </span>
                </span>
                <span className="font-medium">{money(-m.amount, c)}</span>
              </li>
            ))}
          </ul>
        </Card>

        <Card className="glass-card rounded-2xl p-6">
          <h3 className="text-lg font-semibold">Recurring charges</h3>
          <ul className="mt-4 divide-y divide-border">
            {data.recurring.map((r) => (
              <li key={r.name} className="flex items-center justify-between py-3 text-sm">
                <span>
                  {r.name}
                  <span className="ml-2 text-xs text-muted-foreground">{r.cadence}</span>
                </span>
                <span className="font-medium">{money(-r.amount, c)}</span>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <Card className="glass-card rounded-2xl p-6">
        <h3 className="text-lg font-semibold">Largest transactions</h3>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="pb-2">Date</th>
                <th className="pb-2">Description</th>
                <th className="pb-2">Category</th>
                <th className="pb-2 text-right">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {data.largestTransactions.map((t, i) => (
                <tr key={i}>
                  <td className="py-2.5 whitespace-nowrap text-muted-foreground">{t.date}</td>
                  <td className="py-2.5">{t.description}</td>
                  <td className="py-2.5 text-muted-foreground">{t.category}</td>
                  <td className="py-2.5 text-right font-medium">{money(-t.amount, c)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="glass-card rounded-2xl p-6">
          <h3 className="flex items-center gap-2 text-lg font-semibold">
            <Sparkles className="size-4 text-primary" /> What we noticed
          </h3>
          <ul className="mt-4 space-y-3 text-sm text-muted-foreground">
            {data.insights.map((insight, i) => (
              <li key={i} className="flex gap-2">
                <span className="mt-2 size-1.5 shrink-0 rounded-full bg-primary" />
                {insight}
              </li>
            ))}
          </ul>
        </Card>

        <Card className="glass-card rounded-2xl p-6">
          <h3 className="text-lg font-semibold">Ways to save</h3>
          <div className="mt-4 space-y-4">
            {data.recommendations.map((rec) => (
              <div key={rec.title} className="rounded-xl bg-secondary/50 p-4">
                <div className="flex items-start justify-between gap-3">
                  <p className="font-medium">{rec.title}</p>
                  <span className="whitespace-nowrap text-sm text-primary">
                    +{money(rec.potentialSaving, c)}/mo
                  </span>
                </div>
                <p className="mt-1 text-sm text-muted-foreground">{rec.detail}</p>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "up" | "down";
}) {
  return (
    <Card className="glass-card rounded-2xl p-5">
      <p className="text-xs uppercase tracking-widest text-muted-foreground">{label}</p>
      <p
        className={`mt-2 font-display text-2xl font-bold ${
          tone === "up" ? "text-primary" : tone === "down" ? "text-destructive" : ""
        }`}
      >
        {value}
      </p>
    </Card>
  );
}
