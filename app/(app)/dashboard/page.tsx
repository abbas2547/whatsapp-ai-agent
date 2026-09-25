import type { Metadata } from "next";
import Link from "next/link";
import { requireSessionOrRedirect } from "@/app/actions";
import { db } from "@/lib/db";
import { getDashboardMetrics, getRecentMessageVolume } from "@/services/analytics/analytics.service";
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
  Inbox,
  MessagesSquare,
  PhoneCall,
  Plug,
  Sparkles,
  Users as UsersIcon,
  Zap,
} from "lucide-react";

export const metadata: Metadata = { title: "Dashboard" };

function greeting(name?: string | null) {
  const hour = new Date().getHours();
  const part = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const first = name?.split(" ")[0];
  return first ? `${part}, ${first}` : part;
}

export default async function DashboardPage() {
  const session = await requireSessionOrRedirect();
  const orgId = session.user.organizationId!;

  const [metrics, whatsapp, volumeSample] = await Promise.all([
    getDashboardMetrics(orgId),
    db.whatsAppPhoneNumber.findFirst({
      where: { organizationId: orgId },
      select: { displayPhoneNumber: true, verifiedName: true, qualityRating: true },
      orderBy: { createdAt: "asc" },
    }),
    getRecentMessageVolume(orgId, 14),
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

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard label="Conversations" value={metrics.conversations} icon={Inbox} href="/inbox" sub={metrics.unread > 0 ? `${metrics.unread} unread` : "All caught up"} tone={metrics.unread > 0 ? "amber" : "default"} />
        <StatCard label="New leads" value={metrics.leads} icon={UsersIcon} href="/leads" sub={`${metrics.qualified} qualified`} tone="blue" />
        <StatCard label="AI resolution" value={total ? `${aiPct}%` : "—"} icon={Sparkles} href="/analytics" sub={total ? `${metrics.aiHandled} AI · ${metrics.humanHandled} human` : "No replies yet"} tone="green" />
        <StatCard label="Appointments" value={metrics.appointments} icon={CalendarCheck2} href="/calendar" sub="Upcoming" />
        <StatCard label="Unread" value={metrics.unread} icon={MessagesSquare} href="/inbox?filter=unread" sub="Need a reply" tone={metrics.unread > 0 ? "red" : "default"} />
        <StatCard label="Qualified leads" value={metrics.qualified} icon={CheckCircle2} href="/leads?status=QUALIFIED" sub="Ready to close" tone="green" />
        <StatCard label="Automation runs" value={metrics.automations} icon={Zap} href="/automations" sub="Last 30 days" />
        <StatCard label="Response" value="Live" icon={Bot} href="/inbox" sub="AI replies in seconds" tone="green" />
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
