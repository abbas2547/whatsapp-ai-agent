"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { LeadStatus } from "@prisma/client";
import { updateLeadAction } from "@/app/actions/crm";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { LeadStatusBadge } from "@/components/status-badges";
import { cn } from "@/lib/utils";

export type PipelineLead = {
  id: string;
  name: string | null;
  phone: string | null;
  service: string | null;
  score: number;
  status: LeadStatus;
  contact: { name: string | null } | null;
};

const COLS: LeadStatus[] = ["NEW", "CONTACTED", "QUALIFIED", "PROPOSAL", "WON", "LOST"];

export function LeadPipeline({ leads }: { leads: PipelineLead[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [dragOver, setDragOver] = useState<LeadStatus | null>(null);
  // Optimistic local grouping so the card visibly moves before refresh.
  const [local, setLocal] = useState<Map<LeadStatus, PipelineLead[]> | null>(null);

  const grouped = local || group(leads);

  function group(items: PipelineLead[]) {
    const m = new Map<LeadStatus, PipelineLead[]>();
    for (const c of COLS) m.set(c, []);
    for (const l of items) grouped_push(m, l);
    return m;
  }
  function grouped_push(m: Map<LeadStatus, PipelineLead[]>, l: PipelineLead) {
    m.get(l.status)?.push(l);
  }

  function onDrop(e: React.DragEvent, target: LeadStatus) {
    e.preventDefault();
    setDragOver(null);
    const id = e.dataTransfer.getData("text/lead-id");
    const from = e.dataTransfer.getData("text/lead-from") as LeadStatus;
    if (!id || !from || from === target) return;
    // Optimistic move.
    const next = group(leads.map((l) => (l.id === id ? { ...l, status: target } : l)));
    setLocal(next);
    startTransition(async () => {
      const result = await updateLeadAction(id, { status: target });
      if (result.ok) {
        toast.success(`Lead moved to ${target.replaceAll("_", " ").toLowerCase()}`);
        router.refresh();
      } else {
        toast.error(result.error);
        setLocal(null);
        router.refresh();
      }
    });
  }

  return (
    <div className="grid gap-3 overflow-x-auto pb-2 md:grid-cols-3 xl:grid-cols-6" style={{ minWidth: 0 }}>
      {COLS.map((col) => (
        <div
          key={col}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(col);
          }}
          onDragLeave={() => setDragOver((d) => (d === col ? null : d))}
          onDrop={(e) => onDrop(e, col)}
          className={cn(
            "min-w-60 rounded-2xl border p-2.5 transition-colors",
            dragOver === col ? "border-primary bg-primary/[0.06]" : "border-border bg-muted/40",
          )}
        >
          <p className="flex items-center justify-between px-1.5 pb-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
            {col} <Badge variant="secondary">{grouped.get(col)?.length || 0}</Badge>
          </p>
          <div className="flex min-h-16 flex-col gap-2">
            {(grouped.get(col) || []).map((lead) => (
              <Card
                key={lead.id}
                draggable={!pending}
                onDragStart={(e) => {
                  e.dataTransfer.setData("text/lead-id", lead.id);
                  e.dataTransfer.setData("text/lead-from", lead.status);
                  e.dataTransfer.effectAllowed = "move";
                }}
                className={cn("cursor-grab p-3 active:cursor-grabbing", pending && "opacity-60")}
              >
                <p className="truncate text-[13px] font-semibold">{lead.name || lead.contact?.name || lead.phone}</p>
                <p className="truncate text-[11px] text-muted-foreground">{lead.service || "No service"} · {lead.score}</p>
                <div className="mt-2"><LeadStatusBadge status={lead.status} /></div>
              </Card>
            ))}
            {(grouped.get(col) || []).length === 0 && (
              <p className="px-1.5 py-4 text-center text-[11px] text-muted-foreground">Drop leads here</p>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
