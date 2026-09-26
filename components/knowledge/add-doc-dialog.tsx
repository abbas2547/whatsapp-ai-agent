"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { addManualKnowledgeAction } from "@/app/actions/knowledge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input, Label, Textarea } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { FilePlus2 } from "lucide-react";

const TYPES = [
  { value: "manual", label: "Manual entry" },
  { value: "faq", label: "FAQ" },
  { value: "product", label: "Product info" },
];

export function AddDocumentDialog({ knowledgeBaseId }: { knowledgeBaseId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [content, setContent] = useState("");
  const [sourceType, setSourceType] = useState<"manual" | "faq" | "product">("manual");
  const [pending, startTransition] = useTransition();

  function submit() {
    startTransition(async () => {
      const result = await addManualKnowledgeAction(knowledgeBaseId, name.trim(), content.trim(), sourceType);
      if (result.ok) {
        toast.success("Document added");
        setOpen(false);
        setName("");
        setContent("");
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <FilePlus2 className="h-4 w-4" /> Add text
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogTitle>Add a document</DialogTitle>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="doc-type">Source type</Label>
            <Select id="doc-type" value={sourceType} onChange={(e) => setSourceType(e.target.value as "manual" | "faq" | "product")}>
              {TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="doc-name">Name</Label>
            <Input id="doc-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Pricing FAQ" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="doc-content">Content</Label>
            <Textarea id="doc-content" value={content} onChange={(e) => setContent(e.target.value)} className="min-h-40" placeholder="Q: What are your prices? A: …" />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={submit} disabled={pending || !name.trim() || !content.trim()}>
              {pending ? "Adding…" : "Add"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}