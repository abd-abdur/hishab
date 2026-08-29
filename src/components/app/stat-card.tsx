import type { ReactNode } from "react";

import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export function StatCard({
  label,
  value,
  detail,
  tone,
  children,
}: {
  label: string;
  value: string;
  detail?: ReactNode;
  tone?: "positive" | "negative" | "warning" | undefined;
  children?: ReactNode;
}) {
  return (
    <Card>
      <CardContent className="pt-5">
        <div className="text-sm text-muted-foreground">{label}</div>
        <div
          className={cn(
            "num mt-1 text-2xl font-semibold tracking-tight",
            tone === "positive" && "text-positive",
            tone === "negative" && "text-negative",
            tone === "warning" && "text-warning",
          )}
        >
          {value}
        </div>
        {detail ? <div className="mt-1 text-sm text-muted-foreground">{detail}</div> : null}
        {children}
      </CardContent>
    </Card>
  );
}
