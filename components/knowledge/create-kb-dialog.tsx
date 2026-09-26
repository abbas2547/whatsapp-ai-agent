"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { createKnowledgeBaseAction } from "@/app/actions/knowledge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input, Label, Textarea } from "@/components/ui/input";
import { Plus } from "lucide-react";

export function CreateKnowledgeBaseDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [pending, startTransition] = useTransition();

  function submit() {
    startTransition(async () => {
      const result = await createKnowledgeBaseAction(name.trim(), description.trim() || undefined);
      if (result.ok) {
        toast.success("Knowledge base created");
        setOpen(false);
        setName("");
        setDescription("");
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="h-4 w-4" /> New knowledge base
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogTitle>Create knowledge base</DialogTitle>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="kb-name">Name</Label>
            <Input id="kb-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Product catalog" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="kb-desc">Description</Label>
            <Textarea id="kb-desc" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What should agents know from this base?" />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={submit} disabled={pending || name.trim().length < 2}>
              {pending ? "Creating…" : "Create"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}