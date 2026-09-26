import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { requireSessionOrRedirect } from "@/app/actions/session";
import { db } from "@/lib/db";
import { getAgent } from "@/services/ai/agent.service";
import { listKnowledgeBases } from "@/services/knowledge/knowledge.service";
import { TOOL_DEFINITIONS } from "@/services/ai/tools/registry";
import { AgentBuilder, type AgentEditorValue } from "@/components/agents/agent-builder";

export const metadata: Metadata = { title: "Edit agent" };
export const dynamic = "force-dynamic";

export default async function EditAgentPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireSessionOrRedirect();
  const orgId = session.user.organizationId!;
  const { id } = await params;

  if (id === "new") redirect("/agents/new");

  const [agent, phones, knowledge] = await Promise.all([
    getAgent(orgId, id).catch(() => null),
    db.whatsAppPhoneNumber.findMany({
      where: { organizationId: orgId },
      select: { id: true, displayPhoneNumber: true, verifiedName: true },
      orderBy: { displayPhoneNumber: "asc" },
    }),
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
    <div className="mx-auto flex max-w-7xl flex-col gap-4">
      <AgentBuilder
        agent={value}
        phones={phones}
        knowledge={knowledge.map((k) => ({
          id: k.id,
          name: k.name,
          documents: k.documents.map((d) => ({ status: d.status })),
        }))}
        tools={TOOL_DEFINITIONS.map((t) => ({ name: t.name, description: t.description }))}
      />
    </div>
  );
}
