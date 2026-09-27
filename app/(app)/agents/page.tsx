import type { Metadata } from "next";
import Link from "next/link";
import { requireSessionOrRedirect } from "@/app/actions/session";
import { listAgents } from "@/services/ai/agent.service";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EmptyState, PageHeader } from "@/components/ui/badge";
import { AgentStatusBadge } from "@/components/status-badges";
import { AgentPauseButton } from "@/components/agents/agent-pause-button";
import { AgentDeleteButton } from "@/components/agents/agent-delete-button";
import { AgentFromWebsite } from "@/components/agents/agent-from-website";
import { fmtDate } from "@/components/format";
import { Bot, Plus, ArrowRight, Sparkles } from "lucide-react";
import type { AgentGoal } from "@prisma/client";

export const metadata: Metadata = { title: "Agents" };

const GOAL_LABELS: Record<AgentGoal, string> = {
  SALES: "Sales",
  LEAD_GENERATION: "Lead generation",
  CUSTOMER_SUPPORT: "Customer support",
  APPOINTMENT_BOOKING: "Appointment booking",
  GENERAL_ASSISTANT: "General assistant",
};

export default async function AgentsPage() {
  const session = await requireSessionOrRedirect();
  const agents = await listAgents(session.user.organizationId!);

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-5">
      <PageHeader
        title="AI Agents"
        description="AI employees that answer your WhatsApp customers instantly."
        actions={
          <Button asChild size="sm">
            <Link href="/agents/new">
              <Plus /> New agent
            </Link>
          </Button>
        }
      />

      <AgentFromWebsite />

      {agents.length ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {agents.map((agent) => {
            const tools = agent.tools.filter((t) => t.enabled);
            const knowledgeCount = agent.knowledgeLinks.length;
            return (
              <Card key={agent.id} className="card-elevated flex h-full flex-col p-5">
                <Link href={`/agents/${agent.id}`} prefetch className="flex min-w-0 flex-1 items-start gap-3.5">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-500/15 to-emerald-500/5 text-xl">
                    {agent.avatar ? <span aria-hidden>{agent.avatar}</span> : <Bot className="h-5 w-5 text-primary" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate text-[15px] font-semibold tracking-tight">{agent.name}</p>
                      <AgentStatusBadge status={agent.status} />
                    </div>
                    <p className="mt-0.5 truncate text-[13px] text-muted-foreground">
                      {GOAL_LABELS[agent.goal]} · {tools.length} tool{tools.length === 1 ? "" : "s"} · {knowledgeCount} knowledge base{knowledgeCount === 1 ? "" : "s"}
                    </p>
                    <p className="mt-1 truncate text-xs text-muted-foreground">
                      {agent.whatsappPhoneNumber ? `📱 ${agent.whatsappPhoneNumber.displayPhoneNumber}` : "Not linked to a number"}
                      {agent.description ? ` · ${agent.description}` : ""}
                    </p>
                    <p className="mt-1 text-[11px] tabular-nums text-muted-foreground">
                      {agent._count.conversations} conversation{agent._count.conversations === 1 ? "" : "s"} · updated {fmtDate(agent.updatedAt)}
                    </p>
                  </div>
                </Link>
                <div className="mt-3 flex items-center justify-between border-t border-border pt-3">
                  <Link href={`/agents/${agent.id}`} prefetch className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline">
                    Open builder <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                  <div className="flex items-center gap-1.5">
                    <AgentPauseButton agentId={agent.id} status={agent.status} />
                    <AgentDeleteButton agentId={agent.id} agentName={agent.name} iconOnly />
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      ) : (
        <EmptyState
          icon={Sparkles}
          title="No agents yet"
          description="Create an AI employee that automatically replies to messages on your WhatsApp number. Train it on your business, connect knowledge, and test before publishing."
          action={
            <Button asChild>
              <Link href="/agents/new">
                <Plus /> Create your first agent
              </Link>
            </Button>
          }
        />
      )}
    </div>
  );
}
