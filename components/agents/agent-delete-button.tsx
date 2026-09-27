"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Trash2, TriangleAlert } from "lucide-react";
import { deleteAgentAction } from "@/app/actions/agents";
import { removeStored } from "@/hooks/use-persistent-state";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";

export function AgentDeleteButton({
  agentId,
  agentName,
  redirectTo,
  iconOnly = false,
}: {
  agentId: string;
  agentName: string;
  redirectTo?: string;
  iconOnly?: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  function confirmDelete() {
    startTransition(async () => {
      const result = await deleteAgentAction(agentId);
      if (result.ok) {
        // Drop any unsaved local draft for this agent so it never resurfaces.
        removeStored(`agent-draft:${agentId}:values`);
        removeStored(`agent-draft:${agentId}:step`);
        toast.success(`"${agentName}" deleted`);
        setOpen(false);
        if (redirectTo) {
          router.replace(redirectTo);
        }
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  }

  return (
    <>
      {iconOnly ? (
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setOpen(true);
          }}
          title={`Delete ${agentName}`}
          aria-label={`Delete ${agentName}`}
          className="text-muted-foreground hover:bg-red-500/10 hover:text-red-600 dark:hover:text-red-400"
        >
          <Trash2 />
        </Button>
      ) : (
        <Button
          variant="outline"
          size="sm"
          onClick={() => setOpen(true)}
          title={`Delete ${agentName}`}
          className="text-muted-foreground hover:border-red-500/40 hover:bg-red-500/[0.06] hover:text-red-600 dark:hover:text-red-400"
        >
          <Trash2 /> Delete
        </Button>
      )}

      <Dialog open={open} onOpenChange={(o) => !pending && setOpen(o)}>
        <DialogContent>
          <DialogTitle>Delete this agent?</DialogTitle>
          <div className="flex items-start gap-3 rounded-2xl border border-red-500/25 bg-red-500/[0.05] p-4">
            <TriangleAlert className="mt-0.5 h-5 w-5 shrink-0 text-red-500" />
            <p className="text-sm leading-6 text-muted-foreground">
              <b className="text-foreground">“{agentName}”</b> will be permanently removed along with its
              configuration and test history. Past conversations, leads and knowledge bases are kept.
            </p>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={confirmDelete} loading={pending}>
              <Trash2 /> {pending ? "Deleting…" : "Delete agent"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
