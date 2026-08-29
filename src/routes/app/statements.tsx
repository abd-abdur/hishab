import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { CheckCircle2, CircleAlert, FileText, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { PageHeader } from "@/components/app/page-header";
import { ParseProgressList } from "@/components/app/parse-progress";
import { StatementReviewTable } from "@/components/app/statement-review-table";
import { UploadDropzone } from "@/components/app/upload-dropzone";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { getCategoriesFn, getStatementsFn } from "@/lib/app-data.functions";
import { useStatementUpload } from "@/lib/extract/use-statement-upload";
import { commitStatementFn, deleteStatementFn } from "@/lib/ingest/ingest.functions";
import { formatDate, formatMoney } from "@/lib/money";

export const Route = createFileRoute("/app/statements")({
  component: StatementsPage,
});

function StatementsPage() {
  const queryClient = useQueryClient();
  const { files, addFiles, removeFile, updateDraftRows } = useStatementUpload();
  const [reviewingId, setReviewingId] = useState<string | null>(null);

  const { data: statements, isPending } = useQuery({
    queryKey: ["statements"],
    queryFn: () => getStatementsFn(),
    staleTime: 30_000,
  });
  const { data: categories } = useQuery({
    queryKey: ["categories"],
    queryFn: () => getCategoriesFn(),
    staleTime: 300_000,
  });

  const categoryOptions = useMemo(
    () => (categories ?? []).map((c) => ({ id: c.id, name: c.name, color: c.color, kind: c.kind })),
    [categories],
  );

  const commitMutation = useMutation({
    mutationFn: ({
      fileId: _fileId,
      ...input
    }: Parameters<typeof commitStatementFn>[0] & { fileId: string }) => commitStatementFn(input),
    onSuccess: (result, variables) => {
      toast.success(
        result.skippedDuplicates > 0
          ? `${result.inserted} transactions imported · ${result.skippedDuplicates} already existed`
          : `${result.inserted} transactions imported`,
      );
      removeFile(variables.fileId);
      setReviewingId(null);
      void queryClient.invalidateQueries();
    },
    onError: () => toast.error("Saving failed. Your review is still here — try again."),
  });

  const deleteMutation = useMutation({
    mutationFn: deleteStatementFn,
    onSuccess: () => {
      toast.success("Statement and its transactions deleted");
      void queryClient.invalidateQueries();
    },
    onError: () => toast.error("Couldn't delete the statement. Try again."),
  });

  const reviewing = files.find((f) => f.id === reviewingId);

  const handleFiles = (incoming: File[]) => {
    const rejection = addFiles(incoming);
    if (rejection) toast.error(rejection);
  };

  return (
    <>
      <PageHeader
        title="Statements"
        description="Upload statements; every row is reviewed by you before it counts."
      />
      <div className="space-y-4 p-4 md:p-6">
        <UploadDropzone
          onFiles={handleFiles}
          compact={files.length > 0 || (statements ?? []).length > 0}
        />
        <ParseProgressList files={files} onReview={setReviewingId} onRemove={removeFile} />

        {isPending ? (
          <Skeleton className="h-40" />
        ) : (statements ?? []).length > 0 ? (
          <div className="divide-y rounded-lg border bg-card">
            {(statements ?? []).map((statement) => (
              <div key={statement.id} className="flex items-center gap-3 px-4 py-3">
                <FileText className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="truncate text-sm font-medium">{statement.fileName}</span>
                    {statement.reconciliationStatus === "reconciled" ? (
                      <Badge variant="outline" className="gap-1 text-positive">
                        <CheckCircle2 className="size-3" />
                        verified
                      </Badge>
                    ) : statement.reconciliationStatus === "mismatch" ? (
                      <Badge variant="outline" className="gap-1 text-warning">
                        <CircleAlert className="size-3" />
                        off by{" "}
                        {formatMoney(
                          Math.abs(statement.reconciliationDeltaMinor ?? 0),
                          statement.currency,
                        )}
                      </Badge>
                    ) : null}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {statement.bankName ? `${statement.bankName} · ` : ""}
                    {statement.periodStart && statement.periodEnd
                      ? `${formatDate(statement.periodStart)} – ${formatDate(statement.periodEnd)} · `
                      : ""}
                    {statement.transactionCount} transactions
                    {statement.duplicateCount > 0
                      ? ` · ${statement.duplicateCount} duplicates skipped`
                      : ""}
                  </div>
                </div>
                <Link
                  to="/app/transactions"
                  search={{ statement: statement.id }}
                  className="text-sm font-medium text-primary hover:underline"
                >
                  View
                </Link>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button size="icon" variant="ghost" aria-label={`Delete ${statement.fileName}`}>
                      <Trash2 className="size-4" />
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Delete this statement?</AlertDialogTitle>
                      <AlertDialogDescription>
                        {statement.fileName} and its {statement.transactionCount} transactions will
                        be removed from your account. This can't be undone.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={() =>
                          deleteMutation.mutate({ data: { statementId: statement.id } })
                        }
                      >
                        Delete
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            ))}
          </div>
        ) : null}
      </div>

      <Dialog open={reviewing != null} onOpenChange={(open) => !open && setReviewingId(null)}>
        <DialogContent className="max-w-4xl">
          {reviewing?.draft ? (
            <>
              <DialogHeader>
                <DialogTitle>Review {reviewing.fileName}</DialogTitle>
                <DialogDescription>
                  Fix anything that looks off — categories are editable. Nothing is saved until you
                  confirm.
                </DialogDescription>
              </DialogHeader>
              <StatementReviewTable
                statement={reviewing.draft.statement}
                rows={reviewing.draft.rows}
                categories={categoryOptions}
                onRowsChange={(rows) => updateDraftRows(reviewing.id, rows)}
              />
              <DialogFooter>
                <Button variant="outline" onClick={() => setReviewingId(null)}>
                  Later
                </Button>
                <Button
                  disabled={commitMutation.isPending}
                  onClick={() =>
                    commitMutation.mutate({
                      fileId: reviewing.id,
                      data: { statement: reviewing.draft!.statement, rows: reviewing.draft!.rows },
                    })
                  }
                >
                  {commitMutation.isPending
                    ? "Saving…"
                    : `Add ${reviewing.draft.rows.filter((r) => !r.duplicate).length} transactions`}
                </Button>
              </DialogFooter>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}
