import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireSessionOrRedirect } from "@/app/actions";
import { db } from "@/lib/db";
import { getAgent } from "@/services/ai/agent.service";
import { listKnowledgeBases } from "@/services/knowledge/knowledge.service";
import { TOOL_NAMES } from "@/services/ai/tools/registry";
import { AgentEditor, type AgentEditorValue } from "@/components/agents/agent-editor";
import { ArrowLeft, Bot } from "lucide-react";
import { AgentStatusBadge } from "@/components/status-badges";

export const metadata: Metadata = { title: "Edit agent" };
export const dynamic = "force-dynamic";

export default async function EditAgentPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireSessionOrRedirect();
  const orgId = session.user.organizationId!;
  const { id } = await params;

  if (id === "new") redirect("/agents/new");

  const [agent, phones, knowledge] = await Promise.all([
    getAgent(orgId, id).catch(() => null),
    db.whatsAppPhoneNumber.findMany({ where: { organizationId: orgId }, orderBy: { displayPhoneNumber: "asc" } }),
    listKnowledgeBases(orgId),
  ]);
  if (!agent) notFound();

  const value: AgentEditorValue = {
    id: agent.id,
    name: agent.name,
    avatar: agent.avatar,
    description: agent.description,
    businessDescription: agent.businessDescription,
    personality: agent.personality,
    tone: agent.tone,
    language: agent.language,
    goal: agent.goal,
    systemInstructions: agent.systemInstructions,
    rules: agent.rules,
    prohibitedActions: agent.prohibitedActions,
    escalationRules: agent.escalationRules,
    fallbackResponse: agent.fallbackResponse,
    status: agent.status,
    whatsappPhoneNumberId: agent.whatsappPhoneNumberId,
    enabledTools: agent.tools.filter((t) => t.enabled).map((t) => t.toolName),
    knowledgeBaseIds: agent.knowledgeLinks.map((k) => k.knowledgeBaseId),
  };

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4">
      <Link href="/agents" className="inline-flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Back to agents
      </Link>
      <div className="flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-full bg-primary/10">
          <Bot className="h-5 w-5 text-primary" />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight">{agent.name}</h1>
            <AgentStatusBadge status={agent.status} />
          </div>
          <p className="text-sm text-muted-foreground">{agent.description || "AI employee"}</p>
        </div>
      </div>
      <AgentEditor agent={value} phones={phones} knowledge={knowledge} toolNames={TOOL_NAMES} />
    </div>
  );
}