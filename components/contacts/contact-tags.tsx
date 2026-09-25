"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { addTagAction, removeTagAction } from "@/app/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { X, Plus } from "lucide-react";

export function ContactTags({ contactId, tags }: { contactId: string; tags: { tag: { id: string; name: string } }[] }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [pending, startTransition] = useTransition();

  function add() {
    if (!name.trim()) return;
    startTransition(async () => {
      const result = await addTagAction(contactId, name.trim());
      if (result.ok) {
        setName("");
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  }

  function remove(tagName: string) {
    startTransition(async () => {
      await removeTagAction(contactId, tagName);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {tags.map(({ tag }) => (
        <Badge key={tag.id} variant="outline" className="gap-1 pr-1">
          {tag.name}
          <button onClick={() => remove(tag.name)} className="rounded-full p-0.5 hover:bg-muted" aria-label={`Remove ${tag.name}`}>
            <X className="h-3 w-3" />
          </button>
        </Badge>
      ))}
      <div className="flex items-center gap-1.5">
        <Input
          className="h-7 w-28 text-xs"
          placeholder="Add tag"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") add();
          }}
        />
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={add} disabled={pending || !name.trim()}>
          <Plus className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}