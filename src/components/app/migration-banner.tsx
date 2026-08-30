import { useQuery, useQueryClient } from "@tanstack/react-query";
import { LockKeyhole } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { runLegacyMigration, type MigrationProgress } from "@/lib/migrate-runner";
import { getMigrationStatusFn } from "@/lib/migrate.functions";

/**
 * Data written before encryption shipped is re-encrypted in the browser, once,
 * the first time the account opens the app with its keys unlocked. Runs
 * automatically; interrupting is safe (the run is resumable).
 */
export function MigrationBanner({ userId }: { userId: string }) {
  const queryClient = useQueryClient();
  const { data: status } = useQuery({
    queryKey: ["migration-status", userId],
    queryFn: () => getMigrationStatusFn(),
    staleTime: 5 * 60_000,
  });
  const pendingCount = status
    ? status.legacyTransactions + status.legacyStatements + status.legacyRules
    : 0;

  const [progress, setProgress] = useState<MigrationProgress | null>(null);
  const [failed, setFailed] = useState(false);
  const startedRef = useRef(false);

  useEffect(() => {
    if (pendingCount === 0 || startedRef.current) return;
    startedRef.current = true;
    void (async () => {
      const result = await runLegacyMigration(userId, setProgress);
      if (result.status === "done") {
        toast.success("Your existing data is now encrypted end to end.");
        setProgress(null);
        await queryClient.invalidateQueries();
      } else if (result.status === "error") {
        setFailed(true);
      } else {
        // locked (no keys in this browser) or nothing to do — stay quiet;
        // the next unlocked visit picks it up.
        setProgress(null);
      }
    })();
  }, [pendingCount, userId, queryClient]);

  if (pendingCount === 0 || (!progress && !failed)) return null;

  return (
    <div className="flex items-center gap-3 border-b bg-accent px-4 py-2 text-sm">
      <LockKeyhole className="size-4 shrink-0 text-accent-foreground" aria-hidden />
      {failed ? (
        <>
          <span className="min-w-0 flex-1">
            Encrypting your earlier data paused partway — nothing is lost, it resumes where it
            stopped.
          </span>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              setFailed(false);
              startedRef.current = false;
              void queryClient.invalidateQueries({ queryKey: ["migration-status"] });
            }}
          >
            Resume
          </Button>
        </>
      ) : (
        <span className="min-w-0 flex-1">
          Encrypting your earlier data{" "}
          {progress ? (
            <span className="num text-muted-foreground">
              — {progress.done} of {progress.total}
            </span>
          ) : (
            "…"
          )}
        </span>
      )}
    </div>
  );
}
