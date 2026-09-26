import type { Metadata } from "next";
import { requireSessionOrRedirect } from "@/app/actions/session";
import { db } from "@/lib/db";
import { listKnowledgeBases } from "@/services/knowledge/knowledge.service";
import { TOOL_DEFINITIONS } from "@/services/ai/tools/registry";
import { AgentBuilder } from "@/components/agents/agent-builder";

export const metadata: Metadata = { title: "New agent" };
export const dynamic = "force-dynamic";

export default async function NewAgentPage() {
  const session = await requireSessionOrRedirect();
  const orgId = session.user.organizationId!;

  const [phones, knowledge] = await Promise.all([
    db.whatsAppPhoneNumber.findMany({
      where: { organizationId: orgId },
      select: { id: true, displayPhoneNumber: true, verifiedName: true },
      orderBy: { displayPhoneNumber: "asc" },
    }),
    listKnowledgeBases(orgId),
  ]);

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-4">
      <AgentBuilder
        agent={null}
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
