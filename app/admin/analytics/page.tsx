import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getAdminContext } from "@/lib/admin";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge, PageHeader } from "@/components/ui/badge";
import { StatCard } from "@/components/ui/stat";
import { Activity, CreditCard, MessageSquare, Users, Workflow } from "lucide-react";

export default async function AdminAnalyticsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const ctx = await getAdminContext();
  if (!ctx) redirect("/dashboard");
  const sp = await searchParams;
  const days = [1, 7, 30, 90].includes(Number(sp.days)) ? Number(sp.days) : 30;
  const since = new Date(new Date().getTime() - days * 24 * 60 * 60 * 1000);
  const [regs, active, orgs, subs, revenue, convs, leads, agents, wa, execs, execFail, msgsIn, msgsOut] = await Promise.all([
    db.user.count({ where: { createdAt: { gte: since } } }),
    db.user.count({ where: { lastSeenAt: { gte: since } } }),
    db.organization.count({ where: { createdAt: { gte: since } } }),
    db.subscription.count({ where: { updatedAt: { gte: since }, status: "ACTIVE" } }),
    db.payment.aggregate({ where: { createdAt: { gte: since }, status: "SUCCESS" }, _sum: { amountPaise: true } }),
    db.conversation.count({ where: { createdAt: { gte: since } } }),
    db.lead.count({ where: { createdAt: { gte: since } } }),
    db.agent.count({ where: { createdAt: { gte: since } } }),
    db.whatsAppPhoneNumber.count({ where: { createdAt: { gte: since } } }),
    db.workflowExecution.count({ where: { startedAt: { gte: since } } }),
    db.workflowExecution.count({ where: { startedAt: { gte: since }, status: "FAILED" } }),
    db.message.count({ where: { direction: "INBOUND", createdAt: { gte: since } } }),
    db.message.count({ where: { direction: "OUTBOUND", createdAt: { gte: since } } }),
  ]);
  const byPlan = await db.subscription.groupBy({ by: ["planId"], _count: { planId: true } });

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Analytics"
        description={`Real database aggregates · last ${days} days. All charts use live counts.`}
        actions={
          <form method="get" className="flex gap-2">
            <select name="days" defaultValue={String(days)} className="h-9 rounded-xl border border-input bg-card px-3 text-sm">
              <option value="1">24 hours</option><option value="7">7 days</option><option value="30">30 days</option><option value="90">90 days</option>
            </select>
            <button className="h-9 rounded-xl bg-primary px-3 text-xs font-semibold text-primary-foreground">Apply</button>
          </form>
        }
      />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Registrations" value={regs} icon={Users} sub={`active ${active}`} tone="blue" />
        <StatCard label="Workspaces" value={orgs} icon={Activity} sub={`${subs} active subs`} />
        <StatCard label="Revenue" value={`₹${((revenue._sum.amountPaise ?? 0) / 100).toLocaleString("en-IN")}`} icon={CreditCard} sub="verified payments" tone="green" />
        <StatCard label="Messages" value={msgsIn + msgsOut} icon={MessageSquare} sub={`${msgsIn} in · ${msgsOut} out`} />
        <StatCard label="Conversations" value={convs} icon={MessageSquare} sub="new in range" />
        <StatCard label="Leads" value={leads} icon={Activity} sub="new in range" tone="blue" />
        <StatCard label="Agents" value={agents} icon={Activity} sub={`${wa} WA numbers`} tone="green" />
        <StatCard label="Automations" value={execs} icon={Workflow} sub={`${execFail} failed`} tone={execFail > 0 ? "red" : "default"} />
      </div>
      <Card><CardHeader><CardTitle>Plan distribution</CardTitle><CardDescription>Live subscription rows</CardDescription></CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {byPlan.map((p) => <Badge key={p.planId} variant="secondary">{p.planId}: {p._count.planId}</Badge>)}
        </CardContent></Card>
    </div>
  );
}
