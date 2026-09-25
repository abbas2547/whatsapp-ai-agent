"use client";

import { useState } from "react";
import { Check, X, Clock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/badge";
import { fmtDateTime, relTime } from "@/components/format";
import { formatDuration, parseLogs, type ExecutionLogEntry } from "@/services/automation/executions";
import { History } from "lucide-react";
import { cn } from "@/lib/utils";

export type RunItem = {
  id: string;
  trigger: string;
  status: string;
  startedAt: Date;
  completedAt: Date | null;
  error: string | null;
  logs: unknown;
};

function RunBadge({ status }: { status: string }) {
  const map: Record<string, "success" | "secondary" | "warning" | "danger" | "info"> = {
    COMPLETED: "success",
    FAILED: "danger",
    RUNNING: "info",
    WAITING: "warning",
    CANCELLED: "secondary",
  };
  return <Badge variant={map[status] || "secondary"}>{status}</Badge>;
}

export function ExecutionHistory({ runs }: { runs: RunItem[] }) {
  const [selected, setSelected] = useState<RunItem | null>(null);

  if (!runs.length) {
    return (
      <EmptyState
        compact
        icon={History}
        title="No runs yet"
        description="Publish this workflow and trigger it — every real execution will be listed here with its timeline."
      />
    );
  }

  return (
    <>
      <div className="flex flex-col divide-y divide-border">
        {runs.map((r) => (
          <button
            key={r.id}
            onClick={() => setSelected(r)}
            className="flex items-center justify-between gap-3 rounded-lg px-2 py-2.5 text-left transition-colors hover:bg-muted/40"
          >
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{r.trigger}</p>
              <p className="text-xs tabular-nums text-muted-foreground">
                {relTime(r.startedAt)} · {formatDuration(r.startedAt, r.completedAt)}
              </p>
            </div>
            <RunBadge status={r.status} />
          </button>
        ))}
      </div>

      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent className="max-w-lg">
          <DialogTitle>Execution timeline</DialogTitle>
          {selected && <RunTimeline run={selected} />}
        </DialogContent>
      </Dialog>
    </>
  );
}

function RunTimeline({ run }: { run: RunItem }) {
  const logs = parseLogs(run.logs);
  return (
    <div className="flex flex-col gap-1">
      <TimelineRow ok label={`Trigger received · ${run.trigger}`} at={fmtDateTime(run.startedAt)} />
      {logs.map((l: ExecutionLogEntry, i: number) => (
        <TimelineRow
          key={i}
          ok={!l.error}
          label={l.error ? `${prettyNode(l.type)} — ${l.error}` : prettyNode(l.type)}
          at={l.at ? fmtDateTime(l.at) : undefined}
        />
      ))}
      {run.status === "COMPLETED" && <TimelineRow ok label="Workflow completed" at={run.completedAt ? fmtDateTime(run.completedAt) : undefined} />}
      {run.status === "FAILED" && (
        <TimelineRow ok={false} label={run.error ? `Failed — ${run.error}` : "Workflow failed"} at={run.completedAt ? fmtDateTime(run.completedAt) : undefined} />
      )}
      {run.status === "RUNNING" && <TimelineRow pending label="Running…" />}
      {run.status === "WAITING" && <TimelineRow pending label="Waiting — will resume automatically" />}
      {run.status === "CANCELLED" && <TimelineRow ok={false} label="Execution canceled" />}
    </div>
  );
}

function prettyNode(type: string) {
  return type.replaceAll("_", " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function TimelineRow({ ok, pending = false, label, at }: { ok?: boolean; pending?: boolean; label: string; at?: string }) {
  return (
    <div className="flex items-start gap-2.5 py-1.5">
      <span className={cn(
        "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full",
        pending ? "bg-muted text-muted-foreground" : ok ? "bg-emerald-500/15 text-emerald-600" : "bg-red-500/10 text-red-600",
      )}>
        {pending ? <Clock className="h-3 w-3" /> : ok ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
      </span>
      <div className="min-w-0">
        <p className="text-[13px] font-medium break-words">{label}</p>
        {at && <p className="text-[11px] tabular-nums text-muted-foreground">{at}</p>}
      </div>
    </div>
  );
}

export function ExecutionHistoryCard({ runs }: { runs: RunItem[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Runs</CardTitle>
        <CardDescription>Real execution history. Select a run for its timeline.</CardDescription>
      </CardHeader>
      <CardContent>
        <ExecutionHistory runs={runs} />
      </CardContent>
    </Card>
  );
}
