import type { Metadata } from "next";
import Link from "next/link";
import { requireSessionOrRedirect } from "@/app/actions";
import { db } from "@/lib/db";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState, PageHeader } from "@/components/ui/badge";
import { Workflow, Plus, Waypoints, ArrowRight, Zap } from "lucide-react";
import { fmtDate } from "@/components/format";

export const metadata: Metadata = { title: "Automations" };
export const dynamic = "force-dynamic";

export default async function AutomationsPage() {
  const session = await requireSessionOrRedirect();
  const orgId = session.user.organizationId!;

  const workflows = await db.workflow.findMany({
    where: { organizationId: orgId },
    include: { _count: { select: { executions: true, nodes: true } } },
    orderBy: { updatedAt: "desc" },
  });

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-5">
      <PageHeader
        title="Automations"
        description="Visual workflows that run when events happen in your workspace."
        actions={
          <Button asChild size="sm">
            <Link href="/automations/new">
              <Plus /> New workflow
            </Link>
          </Button>
        }
      />

      {workflows.length ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {workflows.map((wf) => {
            const nodeCount = wf._count.nodes;
            return (
              <Link key={wf.id} href={`/automations/${wf.id}`} prefetch className="h-full">
                <Card className="card-elevated flex h-full items-start gap-3 p-5">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-violet-500/10">
                    <Waypoints className="h-5 w-5 text-violet-600" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <p className="truncate text-[15px] font-semibold tracking-tight">{wf.name}</p>
                    </div>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {wf.enabled ? <Badge variant="success">Enabled</Badge> : <Badge variant="secondary">Disabled</Badge>}
                      {wf.publishState === "PUBLISHED" ? <Badge variant="success">Published</Badge> : <Badge variant="secondary">Draft</Badge>}
                    </div>
                    <p className="mt-1.5 text-xs tabular-nums text-muted-foreground">
                      {nodeCount} node(s) · {wf._count.executions} execution(s) · updated {fmtDate(wf.updatedAt)}
                    </p>
                    <span className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-primary">
                      Open builder <ArrowRight className="h-3.5 w-3.5" />
                    </span>
                  </div>
                </Card>
              </Link>
            );
          })}
        </div>
      ) : (
        <EmptyState
          icon={Zap}
          title="No workflows"
          description="Automate follow-ups, handoffs and lead moves with a visual flow. Start with a trigger and connect nodes."
          action={
            <Button asChild>
              <Link href="/automations/new">
                <Plus className="h-4 w-4" /> Create your first workflow
              </Link>
            </Button>
          }
        />
      )}
    </div>
  );
}