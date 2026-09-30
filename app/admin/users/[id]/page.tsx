import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getAdminContext } from "@/lib/admin";
import { isOnline } from "@/lib/presence";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge, PageHeader } from "@/components/ui/badge";
import { fmtDateTime, relTime } from "@/components/format";

export default async function AdminUserDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await getAdminContext();
  if (!ctx) redirect("/dashboard");
  const { id } = await params;
  const user = await db.user.findUnique({
    where: { id },
    include: {
      memberships: { include: { organization: { select: { id: true, name: true, slug: true, suspendedAt: true } } } },
      loginEvents: { orderBy: { createdAt: "desc" }, take: 15 },
      userSessions: { orderBy: { lastSeenAt: "desc" }, take: 10 },
    },
  });
  if (!user) notFound();
  const orgId = user.memberships[0]?.organizationId;
  const [agents, convs, leads, payments, sub, timeline] = await Promise.all([
    orgId ? db.agent.count({ where: { organizationId: orgId } }) : 0,
    orgId ? db.conversation.count({ where: { organizationId: orgId } }) : 0,
    orgId ? db.lead.count({ where: { organizationId: orgId } }) : 0,
    orgId ? db.payment.findMany({ where: { organizationId: orgId }, orderBy: { createdAt: "desc" }, take: 5 }) : [],
    orgId ? db.subscription.findUnique({ where: { organizationId: orgId } }) : null,
    db.loginEvent.findMany({ where: { userId: id }, orderBy: { createdAt: "desc" }, take: 30, select: { id: true, type: true, ip: true, createdAt: true } }),
  ]);
  const online = isOnline(user.lastSeenAt);

  const journey: { label: string; at: Date | null }[] = [
    { label: "Account created", at: user.createdAt },
    { label: "First login", at: user.lastLoginAt },
    { label: "Last seen", at: user.lastSeenAt },
    { label: "Logged out", at: user.lastLogoutAt },
  ];

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title={user.name || user.email}
        description={user.email}
        actions={<Badge variant={online ? "success" : "secondary"}>{online ? "● Online" : "○ Offline"}</Badge>}
      />
      <div className="grid gap-4 lg:grid-cols-3">
        <Card><CardHeader><CardTitle>Overview</CardTitle><CardDescription>Identity & presence</CardDescription></CardHeader>
          <CardContent className="flex flex-col gap-2 text-sm">
            <Row k="Email" v={user.email} /><Row k="User ID" v={user.id} />
            <Row k="Joined" v={fmtDateTime(user.createdAt)} /><Row k="Last login" v={fmtDateTime(user.lastLoginAt)} />
            <Row k="Last seen" v={user.lastSeenAt ? `${fmtDateTime(user.lastSeenAt)} (${relTime(user.lastSeenAt)})` : "never"} />
            <Row k="Workspace" v={user.memberships[0]?.organization.name || "—"} />
            <Row k="Role" v={user.memberships[0]?.role || "—"} />
            <Row k="Plan" v={sub ? `${sub.planId} · ${sub.status}` : "free"} />
          </CardContent></Card>
        <Card><CardHeader><CardTitle>Usage</CardTitle><CardDescription>Workspace totals (real counts)</CardDescription></CardHeader>
          <CardContent className="flex flex-col gap-2 text-sm">
            <Row k="Agents" v={String(agents)} /><Row k="Conversations" v={String(convs)} /><Row k="Leads" v={String(leads)} />
            <Row k="Subscription" v={sub ? `${sub.planId} / ${sub.status}` : "none (free)"} />
            <div className="mt-1 flex flex-wrap gap-2">
              {orgId ? <Link href={`/admin/workspaces?q=${orgId}`} className="text-xs font-semibold text-primary hover:underline">Open workspace</Link> : null}
              <Link href="/admin/sessions" className="text-xs font-semibold text-primary hover:underline">Sessions</Link>
            </div>
          </CardContent></Card>
        <Card><CardHeader><CardTitle>Journey</CardTitle><CardDescription>Account → activity timeline</CardDescription></CardHeader>
          <CardContent>
            <ol className="relative ml-2 flex flex-col gap-3 border-l border-border pl-4">
              {journey.map((j) => (
                <li key={j.label} className="text-sm"><p className="font-medium">{j.label}</p><p className="text-xs text-muted-foreground">{j.at ? `${fmtDateTime(j.at)} · ${relTime(j.at)}` : "—"}</p></li>
              ))}
              {timeline.slice(0, 8).map((t) => (
                <li key={t.id} className="text-sm"><p className="font-medium">{t.type}</p><p className="text-xs text-muted-foreground">{fmtDateTime(t.createdAt)} · {t.ip || "no ip"}</p></li>
              ))}
            </ol>
          </CardContent></Card>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card><CardHeader><CardTitle>Sessions</CardTitle><CardDescription>Latest device sessions</CardDescription></CardHeader>
          <CardContent className="flex flex-col divide-y divide-border">
            {user.userSessions.length ? user.userSessions.map((s) => (
              <div key={s.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                <div className="min-w-0"><p className="truncate font-medium">{s.deviceLabel || s.userAgent?.slice(0, 40) || "Unknown device"}</p><p className="truncate text-xs text-muted-foreground">{s.ip || "no ip"} · {relTime(s.lastSeenAt)}{s.revokedAt ? " · REVOKED" : ""}</p></div>
                <Badge variant={s.revokedAt ? "danger" : "success"}>{s.revokedAt ? "Revoked" : "Active"}</Badge>
              </div>
            )) : <p className="py-4 text-center text-sm text-muted-foreground">No sessions recorded yet.</p>}
          </CardContent></Card>
        <Card><CardHeader><CardTitle>Payments</CardTitle><CardDescription>Verified Cashfree / DB records only</CardDescription></CardHeader>
          <CardContent className="flex flex-col divide-y divide-border">
            {payments.length ? payments.map((p) => (
              <div key={p.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                <div><p className="font-medium">₹{(p.amountPaise / 100).toLocaleString("en-IN")} · {p.planId}</p><p className="text-xs text-muted-foreground">{p.providerOrderId} · {relTime(p.createdAt)}</p></div>
                <Badge variant={p.status === "SUCCESS" ? "success" : p.status === "FAILED" ? "danger" : "warning"}>{p.status}</Badge>
              </div>
            )) : <p className="py-4 text-center text-sm text-muted-foreground">No payments.</p>}
          </CardContent></Card>
      </div>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return <div className="flex items-start justify-between gap-3"><span className="text-muted-foreground">{k}</span><span className="min-w-0 truncate text-right font-medium">{v}</span></div>;
}
