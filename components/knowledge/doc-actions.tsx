"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Eye, RotateCcw, Trash2 } from "lucide-react";
import {
  deleteKnowledgeDocumentAction,
  retryKnowledgeDocumentAction,
  previewKnowledgeDocumentAction,
} from "@/app/actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { DocumentStatusBadge } from "@/components/status-badges";

export function DocumentRowActions({
  doc,
}: {
  doc: { id: string; name: string; sourceType: string; status: "UPLOADING" | "PROCESSING" | "READY" | "FAILED" };
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [preview, setPreview] = useState<string | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  function retry() {
    startTransition(async () => {
      const result = await retryKnowledgeDocumentAction(doc.id);
      if (result.ok) {
        toast.success("Reprocessing started");
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  }

  function remove() {
    startTransition(async () => {
      const result = await deleteKnowledgeDocumentAction(doc.id);
      if (result.ok) {
        toast.success("Document deleted");
        setConfirmDelete(false);
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  }

  function openPreview() {
    startTransition(async () => {
      const result = await previewKnowledgeDocumentAction(doc.id);
      if (result.ok) {
        setPreview(result.doc.content || "(no text content)");
        setPreviewOpen(true);
      } else {
        toast.error(result.error);
      }
    });
  }

  return (
    <div className="flex shrink-0 items-center gap-1.5">
      <DocumentStatusBadge status={doc.status} />
      <Button variant="ghost" size="icon-sm" onClick={openPreview} disabled={pending} title="Preview content" aria-label={`Preview ${doc.name}`}>
        <Eye className="h-4 w-4" />
      </Button>
      {doc.status === "FAILED" && (
        <Button variant="ghost" size="icon-sm" onClick={retry} loading={pending} title="Retry processing" aria-label={`Retry ${doc.name}`}>
          <RotateCcw className="h-4 w-4" />
        </Button>
      )}
      <Button variant="ghost" size="icon-sm" onClick={() => setConfirmDelete(true)} title="Delete document" aria-label={`Delete ${doc.name}`} className="hover:text-red-600">
        <Trash2 className="h-4 w-4" />
      </Button>

      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-2xl">
          <DialogTitle>{doc.name}</DialogTitle>
          <p className="text-xs text-muted-foreground">{doc.sourceType} · first 2000 characters</p>
          <div className="max-h-96 overflow-y-auto rounded-xl bg-muted p-4 text-[13px] leading-6 whitespace-pre-wrap">
            {preview || "Loading…"}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <DialogContent>
          <DialogTitle>Delete document?</DialogTitle>
          <p className="text-sm leading-6 text-muted-foreground">
            <b className="text-foreground">{doc.name}</b> and all its indexed chunks will be permanently removed.
            Agents will no longer answer from it.
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setConfirmDelete(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={remove} loading={pending}>
              Delete
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
