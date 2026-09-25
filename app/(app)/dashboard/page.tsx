import type { Metadata } from "next";
import Link from "next/link";
import { requireSessionOrRedirect } from "@/app/actions";
import { db } from "@/lib/db";
import { getDashboardMetrics, getRecentMessageVolume, getDashboardExtras } from "@/services/analytics/analytics.service";
import { getActiveSubscription, getUsageSummary, isPaidActive } from "@/services/billing/entitlements";
import { getPlan } from "@/services/billing/plans";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge, EmptyState, PageHeader } from "@/components/ui/badge";
import { StatCard } from "@/components/ui/stat";
import { ConversationStatusBadge } from "@/components/status-badges";
import { relTime } from "@/components/format";
import {
  ArrowRight,
  Bot,
  CalendarCheck2,
  CheckCircle2,
  CreditCard,
  Database,
  Inbox,
  MessagesSquare,
  PhoneCall,
  Plug,
  Sparkles,
  Timer,
  Users as UsersIcon,
  Workflow,
  Zap,
} from "lucide-react";

export const metadata: Metadata = { title: "Dashboard" };

function greeting(name?: string | null) {
  const hour = new Date().getHours();
  const part = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const first = name?.split(" ")[0];
  return first ? `${part}, ${first}` : part;
}

function ExecutionBadge({ status }: { status: string }) {
  const map: Record<string, "success" | "secondary" | "warning" | "danger" | "info" | "default" | "outline"> = {
    COMPLETED: "success",
    FAILED: "danger",
    RUNNING: "info",
    WAITING: "warning",
    CANCELLED: "secondary",
  };
  return <Badge variant={map[status] || "secondary"}>{status}</Badge>;
}

export default async function DashboardPage() {
  const session = await requireSessionOrRedirect();
  const orgId = session.user.organizationId!;

  const [metrics, whatsapp, volumeSample, extras, subscription, usage] = await Promise.all([
    getDashboardMetrics(orgId),
    db.whatsAppPhoneNumber.findFirst({
      where: { organizationId: orgId },
      select: { displayPhoneNumber: true, verifiedName: true, qualityRating: true },
      orderBy: { createdAt: "asc" },
    }),
    getRecentMessageVolume(orgId, 14),
    getDashboardExtras(orgId),
    getActiveSubscription(orgId),
    getUsageSummary(orgId),
  ]);

  // Bucket real message counts per day (last 14 days). No invented data.
  const days: { label: string; count: number }[] = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = d.toDateString();
    const count = volumeSample.filter((m) => m.createdAt.toDateString() === key).length;
    days.push({ label: d.toLocaleDateString(undefined, { weekday: "narrow" }), count });
  }
  const maxDay = Math.max(1, ...days.map((d) => d.count));
  const total = metrics.aiHandled + metrics.humanHandled;
  const aiPct = total ? Math.round((metrics.aiHandled / total) * 100) : 0;

  const connected = !!whatsapp;
  const plan = getPlan(subscription.planId) ?? getPlan("free")!;
  const paidActive = isPaidActive(subscription);
  const showUsageWarning = usage.aiConversationsPct >= 80 && usage.aiConversationsPct < 100;
  const usageExhausted = usage.aiConversationsPct >= 100;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={greeting(session.user.name)}
        description="Here's what's happening across your WhatsApp operation."
        actions={
          <>
            <Button asChild variant="outline" size="sm">
              <Link href="/agents">
                <Bot /> Manage agents
              </Link>
            </Button>
            <Button asChild size="sm">
              <Link href={connected ? "/inbox" : "/integrations"}>
                {connected ? <><Inbox /> Open inbox</> : <><Plug /> Connect WhatsApp</>}
              </Link>
            </Button>
          </>
        }
      />

      {/* Workspace status — always real */}
      <Card className={connected ? "border-emerald-500/30 bg-gradient-to-r from-emerald-500/[0.07] to-transparent" : "border-amber-500/30 bg-gradient-to-r from-amber-500/[0.07] to-transparent"}>
        <CardContent className="flex flex-wrap items-center gap-3 p-4 sm:p-5">
          <span className={`flex h-10 w-10 items-center justify-center rounded-2xl ${connected ? "bg-emerald-500/15 text-emerald-600" : "bg-amber-500/15 text-amber-600"}`}>
            {connected ? <PhoneCall className="h-5 w-5" /> : <Plug className="h-5 w-5" />}
          </span>
          <div className="min-w-0 flex-1">
            <p className="flex flex-wrap items-center gap-2 text-sm font-semibold">
              {connected ? "WhatsApp Connected" : "WhatsApp Not Connected"}
              <Badge variant={connected ? "success" : "warning"}>{connected ? "Live" : "Setup needed"}</Badge>
            </p>
            <p className="truncate text-[13px] text-muted-foreground">
              {connected
                ? `${whatsapp.displayPhoneNumber}${whatsapp.verifiedName ? ` · ${whatsapp.verifiedName}` : ""}${whatsapp.qualityRating ? ` · Quality: ${whatsapp.qualityRating}` : ""}`
                : "Connect your WhatsApp Business number to start receiving customer conversations."}
            </p>
          </div>
          {!connected && (
            <Button asChild size="sm" variant="outline">
              <Link href="/integrations">
                Connect <ArrowRight />
              </Link>
            </Button>
          )}
        </CardContent>
      </Card>

      {/* Billing status — real plan + real usage */}
      <div className="grid gap-4 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardContent className="flex flex-wrap items-center gap-3 p-4 sm:p-5">
            <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary/10">
              <CreditCard className="h-5 w-5 text-primary" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="flex flex-wrap items-center gap-2 text-sm font-semibold">
                {plan.name.toUpperCase()} PLAN
                <Badge variant={paidActive ? "success" : "secondary"}>
                  {paidActive ? "Active" : subscription.effectiveStatus === "FREE" ? "Free" : subscription.effectiveStatus}
                </Badge>
              </p>
              <div className="mt-2 h-2.5 w-full max-w-md overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={Math.round(usage.aiConversationsPct)} aria-valuemin={0} aria-valuemax={100} aria-label="AI conversation usage">
                <div
                  className={usageExhausted ? "h-full rounded-full bg-red-500" : usage.aiConversationsPct >= 80 ? "h-full rounded-full bg-amber-500" : "h-full rounded-full bg-gradient-to-r from-emerald-500 to-emerald-400"}
                  style={{ width: `${Math.min(100, Math.max(2, usage.aiConversationsPct))}%` }}
                />
              </div>
              <p className="mt-1 text-xs tabular-nums text-muted-foreground">
                {usage.aiConversationsUsed.toLocaleString("en-IN")} / {usage.aiConversationsLimit.toLocaleString("en-IN")} AI conversations
                ({usage.aiConversationsPct.toFixed(1)}% used)
              </p>
            </div>
            <Button asChild size="sm" variant={paidActive ? "outline" : "default"}>
              <Link href="/billing">{paidActive ? "Manage plan" : "Upgrade"}</Link>
            </Button>
          </CardContent>
        </Card>
        <Card className="lg:col-span-2">
          <CardContent className="flex h-full flex-col justify-center gap-1.5 p-4 sm:p-5">
            {usageExhausted ? (
              <>
                <p className="text-sm font-semibold text-red-600 dark:text-red-400">AI quota exhausted</p>
                <p className="text-[13px] text-muted-foreground">
                  The AI has stopped replying until you upgrade. Your data and settings are untouched.
                </p>
                <Button asChild size="sm" className="mt-1 w-fit">
                  <Link href="/pricing">View plans <ArrowRight /></Link>
                </Button>
              </>
            ) : showUsageWarning ? (
              <>
                <p className="text-sm font-semibold">You&apos;ve used {Math.round(usage.aiConversationsPct)}% of your AI limit</p>
                <p className="text-[13px] text-muted-foreground">
                  Upgrade your plan to continue scaling your automation.
                </p>
                <Button asChild size="sm" variant="outline" className="mt-1 w-fit">
                  <Link href="/pricing">View plans <ArrowRight /></Link>
                </Button>
              </>
            ) : (
              <>
                <p className="text-sm font-semibold">{paidActive ? "Plan is healthy" : "Free plan active"}</p>
                <p className="text-[13px] text-muted-foreground">
                  {paidActive
                    ? `Valid until ${subscription.currentPeriodEnd?.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) ?? "—"}.`
                    : `${(usage.aiConversationsLimit - usage.aiConversationsUsed).toLocaleString("en-IN")} AI conversations remaining this period.`}
                </p>
                <Button asChild size="sm" variant="outline" className="mt-1 w-fit">
                  <Link href="/billing">Billing details <ArrowRight /></Link>
                </Button>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard label="Conversations" value={metrics.conversations} icon={Inbox} href="/inbox" sub={metrics.unread > 0 ? `${metrics.unread} unread` : "All caught up"} tone={metrics.unread > 0 ? "amber" : "default"} />
        <StatCard label="New leads" value={metrics.leads} icon={UsersIcon} href="/leads" sub={`${metrics.qualified} qualified`} tone="blue" />
        <StatCard label="AI resolution" value={total ? `${aiPct}%` : "—"} icon={Sparkles} href="/analytics" sub={total ? `${metrics.aiHandled} AI · ${metrics.humanHandled} human` : "No replies yet"} tone="green" />
        <StatCard label="Appointments" value={metrics.appointments} icon={CalendarCheck2} href="/calendar" sub="Upcoming" />
        <StatCard label="Unread" value={metrics.unread} icon={MessagesSquare} href="/inbox?filter=unread" sub="Need a reply" tone={metrics.unread > 0 ? "red" : "default"} />
        <StatCard label="Qualified leads" value={metrics.qualified} icon={CheckCircle2} href="/leads?status=QUALIFIED" sub="Ready to close" tone="green" />
        <StatCard label="Automation runs" value={metrics.automations} icon={Zap} href="/automations" sub="Last 30 days" />
        <StatCard
          label="Avg response"
          value={extras.avgResponseMs == null ? "—" : extras.avgResponseMs < 1000 ? `${extras.avgResponseMs} ms` : `${(extras.avgResponseMs / 1000).toFixed(1)} s`}
          icon={Timer}
          href="/analytics"
          sub="First reply · 30 days"
        />
      </div>

      {/* Quick actions */}
      <div>
        <h2 className="mb-2.5 text-[15px] font-semibold tracking-tight">Quick actions</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {[
            { href: "/agents/new", icon: Bot, title: "Create AI Agent", desc: "New AI employee", tone: "bg-emerald-500/10 text-emerald-600" },
            { href: "/integrations", icon: Plug, title: "Connect WhatsApp", desc: "Link a number", tone: "bg-sky-500/10 text-sky-600" },
            { href: "/knowledge", icon: Database, title: "Upload Knowledge", desc: "Docs & FAQs", tone: "bg-violet-500/10 text-violet-600" },
            { href: "/automations/new", icon: Workflow, title: "Create Automation", desc: "Visual workflow", tone: "bg-amber-500/10 text-amber-600" },
            { href: "/inbox", icon: Inbox, title: "View Inbox", desc: "Conversations", tone: "bg-rose-500/10 text-rose-600" },
          ].map((a) => (
            <Link key={a.title} href={a.href} prefetch className="group">
              <Card className="card-elevated flex items-center gap-3 p-4">
                <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl ${a.tone}`}>
                  <a.icon className="h-5 w-5" />
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-[13px] font-semibold group-hover:text-primary">{a.title}</span>
                  <span className="block truncate text-[11px] text-muted-foreground">{a.desc}</span>
                </span>
              </Card>
            </Link>
          ))}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-5">
        {/* Message volume — real buckets */}
        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle>Message volume</CardTitle>
            <CardDescription>Real messages received in the last 14 days.</CardDescription>
          </CardHeader>
          <CardContent>
            {volumeSample.length ? (
              <div className="flex h-32 items-end gap-1.5" role="img" aria-label={`Message volume, ${volumeSample.length} messages in 14 days`}>
                {days.map((d, i) => (
                  <div key={i} className="flex flex-1 flex-col items-center gap-1.5" title={`${d.count} messages`}>
                    <div
                      className="w-full rounded-t-md bg-gradient-to-t from-emerald-600 to-emerald-400 transition-all"
                      style={{ height: `${Math.max(6, (d.count / maxDay) * 100)}%` }}
                    />
                    <span className="text-[10px] font-medium text-muted-foreground">{d.label}</span>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState
                compact
                title="No messages yet"
                description="Message volume appears here once customers message your WhatsApp number."
                action={<Button asChild size="sm"><Link href="/integrations"><Plug /> Connect WhatsApp</Link></Button>}
              />
            )}
          </CardContent>
        </Card>

        {/* AI vs human */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>AI vs human</CardTitle>
            <CardDescription>Replies sent in the last 30 days.</CardDescription>
          </CardHeader>
          <CardContent>
            {total > 0 ? (
              <>
                <div className="flex h-3 w-full overflow-hidden rounded-full bg-muted" role="img" aria-label={`${aiPct}% handled by AI`}>
                  <div className="bg-gradient-to-r from-emerald-500 to-emerald-400" style={{ width: `${aiPct}%` }} />
                </div>
                <div className="mt-4 flex flex-col gap-2.5 text-sm">
                  <span className="flex items-center justify-between">
                    <span className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full bg-emerald-500" /> AI handled</span>
                    <span className="font-semibold tabular-nums">{metrics.aiHandled}</span>
                  </span>
                  <span className="flex items-center justify-between">
                    <span className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full bg-muted-foreground" /> Human handled</span>
                    <span className="font-semibold tabular-nums">{metrics.humanHandled}</span>
                  </span>
                </div>
                <Button asChild variant="outline" size="sm" className="mt-4 w-full">
                  <Link href="/analytics">View analytics <ArrowRight /></Link>
                </Button>
              </>
            ) : (
              <EmptyState compact title="No replies yet" description="AI and human activity appears here once conversations start." />
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Lead pipeline — real status distribution */}
        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <div>
              <CardTitle>Lead pipeline</CardTitle>
              <CardDescription>All leads by real status.</CardDescription>
            </div>
            <Button asChild variant="ghost" size="sm">
              <Link href="/leads">View all <ArrowRight /></Link>
            </Button>
          </CardHeader>
          <CardContent>
            {extras.pipeline.length ? (
              <div className="flex flex-col gap-2.5">
                {(() => {
                  const max = Math.max(1, ...extras.pipeline.map((p) => p._count.status));
                  const order = ["NEW", "CONTACTED", "QUALIFIED", "PROPOSAL", "WON", "LOST"];
                  return [...extras.pipeline]
                    .sort((a, b) => order.indexOf(a.status) - order.indexOf(b.status))
                    .map((p) => (
                      <Link key={p.status} href={`/leads?status=${p.status}`} className="flex items-center gap-3">
                        <span className="w-24 shrink-0 text-xs font-medium capitalize text-muted-foreground">
                          {p.status.replaceAll("_", " ").toLowerCase()}
                        </span>
                        <span className="h-2.5 flex-1 overflow-hidden rounded-full bg-muted">
                          <span
                            className="block h-full rounded-full bg-gradient-to-r from-sky-500 to-emerald-400"
                            style={{ width: `${Math.max(4, (p._count.status / max) * 100)}%` }}
                          />
                        </span>
                        <span className="w-8 shrink-0 text-right text-xs font-bold tabular-nums">{p._count.status}</span>
                      </Link>
                    ));
                })()}
              </div>
            ) : (
              <EmptyState compact title="No leads yet" description="Leads appear here once AI agents qualify customers." />
            )}
          </CardContent>
        </Card>

        {/* Automation activity — real executions */}
        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <div>
              <CardTitle>Automation activity</CardTitle>
              <CardDescription>Latest real workflow runs.</CardDescription>
            </div>
            <Button asChild variant="ghost" size="sm">
              <Link href="/automations">View all <ArrowRight /></Link>
            </Button>
          </CardHeader>
          <CardContent>
            {extras.executions.length ? (
              <div className="flex flex-col divide-y divide-border">
                {extras.executions.map((e) => (
                  <div key={e.id} className="flex items-center justify-between gap-3 py-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{e.workflow.name}</p>
                      <p className="truncate text-xs text-muted-foreground">{e.trigger} · {relTime(e.startedAt)}</p>
                    </div>
                    <ExecutionBadge status={e.status} />
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState compact title="No automation runs" description="Publish a workflow and its executions will appear here." />
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <div>
              <CardTitle>Recent conversations</CardTitle>
              <CardDescription>Latest customer activity.</CardDescription>
            </div>
            <Button asChild variant="ghost" size="sm">
              <Link href="/inbox">View all <ArrowRight /></Link>
            </Button>
          </CardHeader>
          <CardContent>
            {metrics.recentConversations.length ? (
              <div className="flex flex-col divide-y divide-border">
                {metrics.recentConversations.map((c) => (
                  <Link key={c.id} href={`/inbox/${c.id}`} prefetch className="flex items-center justify-between gap-3 py-2.5 transition-colors hover:bg-muted/40 -mx-2 px-2 rounded-lg">
                    <div className="flex min-w-0 items-center gap-2.5">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[11px] font-bold text-primary">
                        {(c.contact.name || c.contact.phone || "?").slice(0, 2).toUpperCase()}
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium">{c.contact.name || c.contact.phone}</span>
                        <span className="block truncate text-xs text-muted-foreground">{c.messages[0]?.content || "No messages"}</span>
                      </span>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <ConversationStatusBadge status={c.status} />
                      <span className="text-[11px] text-muted-foreground">{relTime(c.lastMessageAt)}</span>
                    </div>
                  </Link>
                ))}
              </div>
            ) : (
              <EmptyState compact title="No conversations yet" description="Once a customer messages your WhatsApp number, conversations will appear here." action={<Button asChild size="sm"><Link href="/integrations">Connect WhatsApp</Link></Button>} />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <div>
              <CardTitle>Recent leads</CardTitle>
              <CardDescription>Opportunities captured by AI.</CardDescription>
            </div>
            <Button asChild variant="ghost" size="sm">
              <Link href="/leads">View all <ArrowRight /></Link>
            </Button>
          </CardHeader>
          <CardContent>
            {metrics.recentLeads.length ? (
              <div className="flex flex-col divide-y divide-border">
                {metrics.recentLeads.map((lead) => (
                  <div key={lead.id} className="flex items-center justify-between gap-3 py-2.5">
                    <div className="flex min-w-0 items-center gap-2.5">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-sky-500/10 text-[11px] font-bold text-sky-600">
                        {(lead.name || lead.contact?.name || lead.phone || "?").slice(0, 2).toUpperCase()}
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium">{lead.name || lead.contact?.name || lead.phone}</span>
                        <span className="block truncate text-xs text-muted-foreground">{lead.service || "No service"} · score {lead.score}</span>
                      </span>
                    </div>
                    <Badge variant="secondary">{lead.status.replaceAll("_", " ")}</Badge>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState compact title="No leads yet" description="Leads are created automatically when AI agents qualify customers." />
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
