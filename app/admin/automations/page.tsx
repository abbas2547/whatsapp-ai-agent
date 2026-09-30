import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getAdminContext } from "@/lib/admin";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge, EmptyState, PageHeader } from "@/components/ui/badge";
import { relTime } from "@/components/format";
import { RetryAutomationButton } from "@/components/admin/admin-actions";

export default async function AdminAutomationsPage() {
  const ctx = await getAdminContext();
  if (!ctx) redirect("/dashboard");
  const [workflows, executions] = await Promise.all([
    db.workflow.findMany({ orderBy: { updatedAt: "desc" }, take: 30, include: { organization: { select: { name: true } }, _count: { select: { executions: true } } } }),
    db.workflowExecution.findMany({ orderBy: { startedAt: "desc" }, take: 20, include: { workflow: { select: { name: true } }, organization: { select: { name: true } } } }),
  ]);
  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Automations" description="Workflows + execution logs. Retries are recorded." />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card><CardHeader><CardTitle>Workflows</CardTitle><CardDescription>Latest 30</CardDescription></CardHeader>
          <CardContent className="flex flex-col divide-y divide-border">
            {workflows.length ? workflows.map((w) => (
              <div key={w.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                <div className="min-w-0"><p className="truncate font-medium">{w.name}</p><p className="truncate text-xs text-muted-foreground">{w.organization.name} · {w._count.executions} runs</p></div>
                <Badge variant={w.enabled ? "success" : "secondary"}>{w.enabled ? "Enabled" : w.publishState}</Badge>
              </div>
            )) : <EmptyState compact title="No workflows" description="Published workflows will appear here." />}
          </CardContent></Card>
        <Card><CardHeader><CardTitle>Executions</CardTitle><CardDescription>Latest 20 runs</CardDescription></CardHeader>
          <CardContent className="flex flex-col divide-y divide-border">
            {executions.length ? executions.map((e) => (
              <div key={e.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                <div className="min-w-0"><p className="truncate font-medium">{e.workflow.name}</p><p className="truncate text-xs text-muted-foreground">{e.organization.name} · {e.trigger} · {relTime(e.startedAt)}{e.error ? ` · ${e.error.slice(0, 80)}` : ""}</p></div>
                <div className="flex shrink-0 items-center gap-2">
                  <Badge variant={e.status === "COMPLETED" ? "success" : e.status === "FAILED" ? "danger" : "info"}>{e.status}</Badge>
                  {e.status === "FAILED" ? <RetryAutomationButton executionId={e.id} /> : null}
                </div>
              </div>
            )) : <EmptyState compact title="No executions" description="Workflow runs will appear here." />}
          </CardContent></Card>
      </div>
    </div>
  );
}
