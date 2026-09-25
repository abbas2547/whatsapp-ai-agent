import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireSessionOrRedirect } from "@/app/actions";
import { db } from "@/lib/db";
import { ArrowLeft, Workflow } from "lucide-react";
import { WorkflowEditorLoader } from "@/components/workflow/editor-loader";
import type { LoadedWorkflow } from "@/components/workflow/editor";

export const metadata: Metadata = { title: "Automation" };
export const dynamic = "force-dynamic";

export default async function AutomationDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireSessionOrRedirect();
  const orgId = session.user.organizationId!;
  const { id } = await params;

  if (id === "new") redirect("/automations/new");

  const [workflow, agents, integrations] = await Promise.all([
    db.workflow.findFirst({
      where: { id, organizationId: orgId },
      include: { nodes: true, edges: true },
    }),
    db.agent.findMany({ where: { organizationId: orgId }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    db.integration.findMany({ where: { organizationId: orgId, provider: "HTTP" }, select: { id: true, name: true } }),
  ]);
  if (!workflow) notFound();

  const loaded: LoadedWorkflow = {
    id: workflow.id,
    name: workflow.name,
    enabled: workflow.enabled,
    publishState: workflow.publishState,
    nodes: workflow.nodes.map((n) => ({
      id: n.id,
      type: n.type,
      label: n.label,
      positionX: n.positionX,
      positionY: n.positionY,
      data: n.data || undefined,
    })),
    edges: workflow.edges.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      sourceHandle: e.sourceHandle,
      targetHandle: e.targetHandle,
      label: e.label,
    })),
  };

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4">
      <Link href="/automations" className="inline-flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Back to automations
      </Link>
      <div className="flex items-center gap-2">
        <Workflow className="h-5 w-5 text-muted-foreground" />
        <h1 className="text-2xl font-semibold tracking-tight">{workflow.name}</h1>
      </div>
      <WorkflowEditorLoader workflow={loaded} agents={agents} integrations={integrations} />
    </div>
  );
}