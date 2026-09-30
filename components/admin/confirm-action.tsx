"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export function ConfirmAction({
  title,
  description,
  confirmLabel = "Confirm",
  danger = false,
  requireText,
  onConfirm,
  children,
}: {
  title: string;
  description: string;
  confirmLabel?: string;
  danger?: boolean;
  requireText?: string;
  onConfirm: () => Promise<void> | void;
  children: (open: () => void) => React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const blocked = requireText ? typed.trim() !== requireText : false;

  async function confirm() {
    if (blocked || busy) return;
    setBusy(true);
    setError(null);
    try {
      await onConfirm();
      setOpen(false);
      setTyped("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Action failed. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {children(() => setOpen(true))}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>{description}</DialogDescription>
          </DialogHeader>
          {requireText ? (
            <div className="flex flex-col gap-1.5">
              <label htmlFor="confirm-text" className="text-xs font-semibold">
                Type <code className="rounded bg-muted px-1">{requireText}</code> to confirm
              </label>
              <input
                id="confirm-text"
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                className="h-10 rounded-xl border border-input bg-card px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                autoComplete="off"
              />
            </div>
          ) : null}
          {error ? <p className="rounded-xl bg-red-500/10 px-3 py-2 text-xs font-medium text-red-600">{error}</p> : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={busy}>
              Cancel
            </Button>
            <Button variant={danger ? "destructive" : "default"} onClick={confirm} disabled={busy || blocked}>
              {busy ? "Working…" : confirmLabel}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
