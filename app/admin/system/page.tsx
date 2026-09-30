import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getAdminContext } from "@/lib/admin";
import { getSystemHealth } from "@/lib/health";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge, PageHeader } from "@/components/ui/badge";
import { relTime } from "@/components/format";

export default async function AdminSystemPage() {
  const ctx = await getAdminContext();
  if (!ctx) redirect("/dashboard");
  const [health, queue, lastChecks] = await Promise.all([
    getSystemHealth(),
    Promise.all([
      db.workflowExecution.count({ where: { status: "RUNNING" } }),
      db.workflowExecution.count({ where: { status: "WAITING" } }),
      db.workflowExecution.count({ where: { status: "FAILED" } }),
    ]),
    db.systemHealthCheck.findMany({ orderBy: { checkedAt: "desc" }, take: 10 }).catch(() => []),
  ]);
  const [pending, processing, failed] = queue;

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="System Health" description="Live checks. Missing credentials show “Not configured” — never a fake green status." />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {health.map((h) => (
          <Card key={h.service}><CardHeader><CardTitle className="capitalize">{h.service}</CardTitle><CardDescription>{h.message}</CardDescription></CardHeader>
            <CardContent className="flex items-center justify-between">
              <Badge variant={h.status === "CONNECTED" ? "success" : h.status === "ERROR" ? "danger" : h.status === "NOT_CONFIGURED" ? "warning" : "secondary"}>{h.status.replaceAll("_", " ")}</Badge>
              <span className="text-xs text-muted-foreground">{h.latencyMs != null ? `${h.latencyMs} ms` : "—"}</span>
            </CardContent></Card>
        ))}
        <Card><CardHeader><CardTitle>Queue</CardTitle><CardDescription>Workflow executions by state</CardDescription></CardHeader>
          <CardContent className="flex gap-2">
            <Badge variant="warning">Pending {pending}</Badge>
            <Badge variant="info">Processing {processing}</Badge>
            <Badge variant="danger">Failed {failed}</Badge>
          </CardContent></Card>
      </div>
      <Card><CardHeader><CardTitle>Recent checks</CardTitle><CardDescription>Persisted health snapshots (latest 10)</CardDescription></CardHeader>
        <CardContent className="flex flex-col divide-y divide-border">
          {lastChecks.length ? lastChecks.map((c) => (
            <div key={c.id} className="flex items-center justify-between py-2 text-sm">
              <span className="font-medium">{c.service} · {c.status}</span>
              <span className="text-xs text-muted-foreground">{relTime(c.checkedAt)}</span>
            </div>
          )) : <p className="py-3 text-center text-sm text-muted-foreground">No snapshots yet — they are written by the health API on each admin visit.</p>}
        </CardContent></Card>
    </div>
  );
}
