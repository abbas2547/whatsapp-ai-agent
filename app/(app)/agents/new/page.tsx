import type { Metadata } from "next";
import { requireSessionOrRedirect } from "@/app/actions";
import { db } from "@/lib/db";
import { listKnowledgeBases } from "@/services/knowledge/knowledge.service";
import { TOOL_NAMES } from "@/services/ai/tools/registry";
import { AgentEditor } from "@/components/agents/agent-editor";

export const metadata: Metadata = { title: "New agent" };
export const dynamic = "force-dynamic";

export default async function NewAgentPage() {
  const session = await requireSessionOrRedirect();
  const orgId = session.user.organizationId!;

  const [phones, knowledge] = await Promise.all([
    db.whatsAppPhoneNumber.findMany({ where: { organizationId: orgId }, orderBy: { displayPhoneNumber: "asc" } }),
    listKnowledgeBases(orgId),
  ]);

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">New agent</h1>
        <p className="text-sm text-muted-foreground">Set up a new AI employee for your WhatsApp number.</p>
      </div>
      <AgentEditor
        agent={null}
        phones={phones}
        knowledge={knowledge}
        toolNames={TOOL_NAMES}
      />
    </div>
  );
}