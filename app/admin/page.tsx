import Link from "next/link";
import { getAdminContext } from "@/lib/admin";
import { getAdminOverview, paiseToInr } from "@/lib/admin-queries";
import { getSystemHealth } from "@/lib/health";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge, EmptyState, PageHeader } from "@/components/ui/badge";
import { StatCard } from "@/components/ui/stat";
import { relTime } from "@/components/format";
import { Activity, CreditCard, HeartPulse, MessageSquare, Phone, ShieldCheck, Users, Workflow } from "lucide-react";
import { redirect } from "next/navigation";

function hourGreeting() {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

export default async function AdminOverviewPage() {
  const ctx = await getAdminContext();
  if (!ctx) redirect("/dashboard");
  const [data, health] = await Promise.all([getAdminOverview(), getSystemHealth()]);
  const first = ctx.name?.split(" ")[0] || "Admin";

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={`${hourGreeting()}, ${first}`}
        description="Live operational visibility across users, billing, WhatsApp, AI and system health. All figures are real database values."
        actions={
          <span className="text-xs text-muted-foreground">Updated {new Date().toLocaleTimeString()} · auto-refresh via Live</span>
        }
      />

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard label="Users" value={data.users.total} icon={Users} href="/admin/users" sub={`${data.users.online} online · ${data.users.newToday} today`} tone="blue" />
        <StatCard label="Workspaces" value={data.workspaces.total} icon={ShieldCheck} href="/admin/workspaces" sub={`${data.workspaces.active} active · ${data.workspaces.suspended} suspended`} tone="default" />
        <StatCard label="Revenue (30d)" value={paiseToInr(data.payments.monthPaise)} icon={CreditCard} href="/admin/payments" sub={`${data.payments.success} paid · ${data.payments.failed} failed`} tone="green" />
        <StatCard label="WhatsApp" value={`${data.whatsapp.connected}/${data.whatsapp.accounts}`} icon={Phone} href="/admin/whatsapp" sub={`${data.whatsapp.numbers} numbers connected`} tone={data.whatsapp.connected > 0 ? "green" : "amber"} />
        <StatCard label="AI agents" value={data.ai.activeAgents} icon={Activity} href="/admin/agents" sub={`${data.ai.aiMessages} AI msgs · 30d`} tone="green" />
        <StatCard label="Conversations (AI)" value={data.ai.aiConversations} icon={MessageSquare} href="/admin/conversations" sub="Currently AI-active" />
        <StatCard label="Automations (30d)" value={data.ops.automationRuns} icon={Workflow} href="/admin/automations" sub={`${data.ops.failedAutomations} failed`} tone={data.ops.failedAutomations > 0 ? "red" : "default"} />
        <StatCard label="Revenue today" value={paiseToInr(data.payments.todayPaise)} icon={CreditCard} href="/admin/payments" sub={`${data.payments.pending} pending payments`} tone="blue" />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <div><CardTitle>Subscriptions by plan</CardTitle><CardDescription>Real subscription rows.</CardDescription></div>
            <Link href="/admin/subscriptions" className="text-xs font-semibold text-primary hover:underline">View all</Link>
          </CardHeader>
          <CardContent>
            {data.subscriptions.byPlan.length ? (
              <div className="flex flex-col gap-2.5">
                {data.subscriptions.byPlan.map((p) => (
                  <div key={p.planId} className="flex items-center justify-between text-sm">
                    <span className="font-medium capitalize">{p.planId}</span>
                    <Badge variant="secondary">{p._count.planId}</Badge>
                  </div>
                ))}
              </div>
            ) : <EmptyState compact title="No subscriptions" description="Paid subscriptions will appear here after verified Cashfree webhooks." />}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <div><CardTitle>System health</CardTitle><CardDescription>Never faked — “Not configured” means missing credentials.</CardDescription></div>
            <Link href="/admin/system" className="text-xs font-semibold text-primary hover:underline">Details</Link>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col gap-2">
              {health.map((h) => (
                <div key={h.service} className="flex items-center justify-between gap-3 text-sm">
                  <span className="flex items-center gap-2 font-medium capitalize"><HeartPulse className="h-3.5 w-3.5 text-muted-foreground" />{h.service}</span>
                  <Badge variant={h.status === "CONNECTED" ? "success" : h.status === "ERROR" ? "danger" : h.status === "NOT_CONFIGURED" ? "warning" : "secondary"}>{h.status.replaceAll("_", " ")}</Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <div><CardTitle>New users</CardTitle><CardDescription>Latest registrations.</CardDescription></div>
            <Link href="/admin/users" className="text-xs font-semibold text-primary hover:underline">View all</Link>
          </CardHeader>
          <CardContent>
            {data.recent.users.length ? (
              <div className="flex flex-col divide-y divide-border">
                {data.recent.users.map((u) => (
                  <Link key={u.id} href={`/admin/users/${u.id}`} className="flex items-center justify-between gap-3 py-2">
                    <div className="min-w-0"><p className="truncate text-sm font-medium">{u.name || u.email}</p><p className="truncate text-xs text-muted-foreground">{u.email}</p></div>
                    <span className="shrink-0 text-[11px] text-muted-foreground">{relTime(u.createdAt)}</span>
                  </Link>
                ))}
              </div>
            ) : <EmptyState compact title="No users yet" description="Registrations will appear here." />}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <div><CardTitle>Recent sign-ins</CardTitle><CardDescription>Login / logout presence events.</CardDescription></div>
            <Link href="/admin/sessions" className="text-xs font-semibold text-primary hover:underline">Sessions</Link>
          </CardHeader>
          <CardContent>
            {data.recent.logins.length ? (
              <div className="flex flex-col divide-y divide-border">
                {data.recent.logins.map((l) => (
                  <div key={l.id} className="flex items-center justify-between gap-3 py-2">
                    <div className="min-w-0"><p className="truncate text-sm font-medium">{l.user?.name || l.user?.email || l.userId.slice(0, 8)}</p><p className="truncate text-xs text-muted-foreground">{l.type} · {l.ip || "no ip"}</p></div>
                    <span className="shrink-0 text-[11px] text-muted-foreground">{relTime(l.createdAt)}</span>
                  </div>
                ))}
              </div>
            ) : <EmptyState compact title="No sign-ins recorded" description="Logins are recorded from the next sign-in onwards." />}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
