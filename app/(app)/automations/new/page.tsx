import type { Metadata } from "next";
import Link from "next/link";
import { requireSessionOrRedirect } from "@/app/actions";
import { db } from "@/lib/db";
import { ArrowLeft, Workflow } from "lucide-react";
import { WorkflowEditorLoader } from "@/components/workflow/editor-loader";

export const metadata: Metadata = { title: "New automation" };
export const dynamic = "force-dynamic";

export default async function NewAutomationPage() {
  const session = await requireSessionOrRedirect();
  const orgId = session.user.organizationId!;

  const [agents, integrations] = await Promise.all([
    db.agent.findMany({ where: { organizationId: orgId }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    db.integration.findMany({ where: { organizationId: orgId, provider: "HTTP" }, select: { id: true, name: true } }),
  ]);

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4">
      <Link href="/automations" className="inline-flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Back to automations
      </Link>
      <div className="flex items-center gap-2">
        <Workflow className="h-5 w-5 text-muted-foreground" />
        <h1 className="text-2xl font-semibold tracking-tight">New workflow</h1>
      </div>
      <WorkflowEditorLoader workflow={null} agents={agents} integrations={integrations} />
    </div>
  );
}