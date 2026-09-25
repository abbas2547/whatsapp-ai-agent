"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { importContactsAction } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Import } from "lucide-react";

export function ImportContactsDialog() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  function handleFile(file: File) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const csv = String(reader.result || "");
      startTransition(async () => {
        const result = await importContactsAction(csv);
        if (result.ok) {
          toast.success(`Imported ${result.created} contact(s)`);
          setOpen(false);
          router.refresh();
        } else {
          toast.error(result.error);
        }
      });
    };
    reader.readAsText(file);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Import className="h-4 w-4" /> Import CSV
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogTitle>Import contacts</DialogTitle>
        <p className="text-sm text-muted-foreground">
          Upload a CSV with columns <code className="rounded bg-muted px-1">name,phone,email,company</code>. The
          first row is skipped as a header. A phone number is required for each row.
        </p>
        <input
          ref={inputRef}
          type="file"
          accept=".csv,text/csv"
          className="block w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-muted file:px-3 file:py-2"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleFile(file);
          }}
        />
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={() => inputRef.current?.click()} disabled={pending}>
            {pending ? "Importing…" : "Choose file"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}