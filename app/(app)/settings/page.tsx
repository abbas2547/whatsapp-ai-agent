import type { Metadata } from "next";
import { requireSessionOrRedirect } from "@/app/actions";
import { listMembers } from "@/services/organization/organization.service";
import { db } from "@/lib/db";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge, PageHeader } from "@/components/ui/badge";
import { StatCard } from "@/components/ui/stat";
import { OrgNameForm, MemberRow, QualificationFieldsEditor } from "@/components/settings";
import { fmtDateTime, relTime } from "@/components/format";
import { daysAgo } from "@/lib/utils";
import {
  Building2,
  Users,
  ListChecks,
  CreditCard,
  ShieldCheck,
  MessagesSquare,
  Sparkles,
  Zap,
  Database,
  TriangleAlert,
} from "lucide-react";

export const metadata: Metadata = { title: "Settings" };
export const dynamic = "force-dynamic";

const SECTIONS = [
  { href: "#workspace", label: "Workspace", icon: Building2 },
  { href: "#team", label: "Team", icon: Users },
  { href: "#qualification", label: "Qualification", icon: ListChecks },
  { href: "#billing", label: "Billing", icon: CreditCard },
  { href: "#security", label: "Security", icon: ShieldCheck },
];

export default async function SettingsPage() {
  const session = await requireSessionOrRedirect();
  const orgId = session.user.organizationId!;
  const userId = session.user.id!;
  const role = (session.user.role as "OWNER" | "ADMIN" | "AGENT_MANAGER" | "SUPPORT" | "VIEWER") || "VIEWER";

  const since = daysAgo(30);
  const [organization, members, qualificationFields, usage, sessions, credentials, auditLogs] = await Promise.all([
    db.organization.findUnique({ where: { id: orgId }, select: { id: true, name: true, slug: true, createdAt: true } }),
    listMembers(orgId),
    db.qualificationField.findMany({ where: { organizationId: orgId }, orderBy: { sortOrder: "asc" } }),
    Promise.all([
      db.message.count({ where: { organizationId: orgId, createdAt: { gte: since } } }),
      db.usageEvent.aggregate({ where: { organizationId: orgId, type: "ai.tokens", createdAt: { gte: since } }, _sum: { quantity: true } }),
      db.workflowExecution.count({ where: { organizationId: orgId, startedAt: { gte: since } } }),
      db.knowledgeDocument.count({ where: { organizationId: orgId } }),
    ]),
    db.session.count({ where: { userId } }),
    db.apiCredential.findMany({
      where: { organizationId: orgId },
      select: { id: true, provider: true, label: true, createdAt: true },
      orderBy: { createdAt: "desc" },
      take: 10,
    }),
    db.auditLog.findMany({
      where: { organizationId: orgId },
      select: { id: true, action: true, entityType: true, createdAt: true, user: { select: { name: true, email: true } } },
      orderBy: { createdAt: "desc" },
      take: 10,
    }),
  ]);

  const [messagesUsed, tokenAgg, runsUsed, docsStored] = usage;

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-5">
      <PageHeader title="Settings" description="Workspace profile, team, billing and security." />

      <div className="grid items-start gap-5 lg:grid-cols-[200px_minmax(0,1fr)]">
        <nav aria-label="Settings sections" className="flex gap-1.5 overflow-x-auto lg:sticky lg:top-20 lg:flex-col lg:overflow-visible">
          {SECTIONS.map((s) => (
            <a
              key={s.href}
              href={s.href}
              className="flex shrink-0 items-center gap-2.5 rounded-xl px-3 py-2 text-[13px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <s.icon className="h-4 w-4" /> {s.label}
            </a>
          ))}
        </nav>

        <div className="flex min-w-0 flex-col gap-5">
          <section id="workspace" className="scroll-mt-20">
            {organization ? <OrgNameForm orgId={organization.id} name={organization.name} /> : null}
            {organization && (
              <Card className="mt-4">
                <CardContent className="flex flex-wrap gap-x-6 gap-y-1 p-5 text-[13px] text-muted-foreground">
                  <span>Slug: <b className="text-foreground">{organization.slug}</b></span>
                  <span>Created: <b className="text-foreground">{fmtDateTime(organization.createdAt)}</b></span>
                </CardContent>
              </Card>
            )}
          </section>

          <section id="team" className="scroll-mt-20">
            <Card>
              <CardHeader>
                <CardTitle>Team members</CardTitle>
                <CardDescription>Owners and admins can change roles. Roles: Owner, Admin, Agent Manager, Support, Viewer.</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col divide-y divide-border">
                {members.map((m) => (
                  <MemberRow key={m.id} member={m} viewerRole={role} />
                ))}
              </CardContent>
            </Card>
          </section>

          <section id="qualification" className="scroll-mt-20">
            <QualificationFieldsEditor initial={qualificationFields} />
          </section>

          <section id="billing" className="scroll-mt-20">
            <Card className="border-amber-500/30">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">Billing & plan <Badge variant="warning">Not configured</Badge></CardTitle>
                <CardDescription>
                  No payment gateway is connected, so there is no active subscription. Nothing is billed and no
                  premium features are unlocked by the UI — usage below is real metered activity.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                  <StatCard label="Messages (30d)" value={messagesUsed} icon={MessagesSquare} />
                  <StatCard label="AI tokens (30d)" value={(tokenAgg._sum.quantity || 0).toLocaleString()} icon={Sparkles} />
                  <StatCard label="Workflow runs (30d)" value={runsUsed} icon={Zap} />
                  <StatCard label="Knowledge docs" value={docsStored} icon={Database} />
                </div>
                <p className="mt-3 flex items-start gap-1.5 text-xs leading-5 text-muted-foreground">
                  <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  Payment status always comes from verified server-side gateway/webhook data. Connect a gateway to
                  enable plans, renewals and invoices.
                </p>
              </CardContent>
            </Card>
          </section>

          <section id="security" className="scroll-mt-20">
            <Card>
              <CardHeader>
                <CardTitle>Security</CardTitle>
                <CardDescription>Your sessions, stored credentials and recent audit trail.</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                <div className="grid grid-cols-2 gap-3">
                  <StatCard label="Your active sessions" value={sessions} icon={ShieldCheck} />
                  <StatCard label="Stored credentials" value={credentials.length} icon={ShieldCheck} sub="Encrypted at rest" />
                </div>
                {credentials.length > 0 && (
                  <div className="flex flex-col divide-y divide-border rounded-xl border border-border">
                    {credentials.map((c) => (
                      <div key={c.id} className="flex items-center justify-between gap-3 px-3.5 py-2.5">
                        <p className="truncate text-[13px] font-medium">{c.label}</p>
                        <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">{c.provider}</span>
                      </div>
                    ))}
                  </div>
                )}
                <div>
                  <p className="mb-2 text-[13px] font-semibold">Recent audit log</p>
                  {auditLogs.length ? (
                    <div className="flex flex-col divide-y divide-border rounded-xl border border-border">
                      {auditLogs.map((a) => (
                        <div key={a.id} className="flex items-center justify-between gap-3 px-3.5 py-2.5">
                          <div className="min-w-0">
                            <p className="truncate text-[13px] font-medium">{a.action}</p>
                            <p className="truncate text-[11px] text-muted-foreground">
                              {a.user?.name || a.user?.email || "System"}{a.entityType ? ` · ${a.entityType}` : ""}
                            </p>
                          </div>
                          <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">{relTime(a.createdAt)}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-[13px] text-muted-foreground">No audit events yet.</p>
                  )}
                </div>
                <p className="text-xs leading-5 text-muted-foreground">
                  You are signed in as <b className="text-foreground">{role.replaceAll("_", " ")}</b>. Secrets such as
                  database URLs, API keys and app secrets are server-only and never sent to the browser.
                </p>
              </CardContent>
            </Card>
          </section>
        </div>
      </div>
    </div>
  );
}
