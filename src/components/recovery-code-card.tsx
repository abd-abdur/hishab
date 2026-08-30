import { Check, Copy, ShieldAlert } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

/**
 * One-time display of the encryption recovery code. Shown at key creation and
 * after a recovery re-wrap. The code is never shown again afterwards.
 */
export function RecoveryCodeCard({
  recoveryCode,
  onDone,
}: {
  recoveryCode: string;
  onDone: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const [acknowledged, setAcknowledged] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(recoveryCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard blocked — the code is selectable
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ShieldAlert className="size-5 text-warning" aria-hidden />
          Save your recovery code
        </CardTitle>
        <CardDescription>
          Your financial data is protected by an encryption key only you hold. If you ever forget
          your password, this code is the <strong>only</strong> way back into your data; we cannot
          recover it for you.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="rounded-md border bg-muted/40 p-3 font-mono text-sm leading-relaxed break-all select-all">
          {recoveryCode}
        </div>
        <Button variant="outline" className="w-full" onClick={() => void copy()}>
          {copied ? (
            <Check className="size-4" aria-hidden />
          ) : (
            <Copy className="size-4" aria-hidden />
          )}
          {copied ? "Copied" : "Copy code"}
        </Button>
        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            className="mt-1"
            checked={acknowledged}
            onChange={(e) => setAcknowledged(e.target.checked)}
          />
          <span>
            I've saved this code somewhere safe (a password manager, or written down, not just on
            this device).
          </span>
        </label>
        <Button className="w-full" disabled={!acknowledged} onClick={onDone}>
          Continue
        </Button>
      </CardContent>
    </Card>
  );
}
