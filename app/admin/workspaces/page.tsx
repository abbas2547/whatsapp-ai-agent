import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getAdminContext } from "@/lib/admin";
import { Card, CardContent } from "@/components/ui/card";
import { Badge, EmptyState, PageHeader } from "@/components/ui/badge";
import { Pagination } from "@/components/ui/stat";
import { relTime } from "@/components/format";
import { SuspendWorkspaceButton } from "@/components/admin/admin-actions";

const PAGE = 20;

export default async function AdminWorkspacesPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const ctx = await getAdminContext();
  if (!ctx) redirect("/dashboard");
  const sp = await searchParams;
  const q = (sp.q || "").trim().slice(0, 100);
  const page = Math.max(1, Number(sp.page || "1") || 1);
  const where = q ? { OR: [{ name: { contains: q, mode: "insensitive" as const } }, { slug: { contains: q, mode: "insensitive" as const } }] } : {};
  const orgs = await db.organization.findMany({
    where, orderBy: { createdAt: "desc" }, skip: (page - 1) * PAGE, take: PAGE + 1,
    select: {
      id: true, name: true, slug: true, createdAt: true, suspendedAt: true, updatedAt: true,
      members: { select: { user: { select: { email: true } } }, take: 1 },
      subscription: { select: { planId: true, status: true, currentPeriodEnd: true } },
      _count: { select: { whatsappPhoneNumbers: true, agents: true, contacts: true, leads: true, conversations: true } },
    },
  });
  const hasMore = orgs.length > PAGE;
  const rows = orgs.slice(0, PAGE);

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Workspaces" description="Suspend / reactivate with confirmation. Every action is audit-logged." />
      <form method="get" className="flex gap-2">
        <input name="q" defaultValue={q} placeholder="Search workspace…" className="h-10 min-w-0 flex-1 rounded-xl border border-input bg-card px-3 text-sm sm:max-w-xs" />
        <button className="h-10 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground">Search</button>
      </form>
      {rows.length ? (
        <>
          <div className="grid gap-3">
            {rows.map((o) => (
              <Card key={o.id}><CardContent className="flex flex-wrap items-center gap-3 p-4">
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2 text-sm font-semibold">{o.name}
                    {o.suspendedAt ? <Badge variant="danger">Suspended</Badge> : <Badge variant="success">Active</Badge>}
                    <Badge variant="secondary">{o.subscription ? `${o.subscription.planId} · ${o.subscription.status}` : "free"}</Badge>
                  </p>
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">
                    {o.members[0]?.user.email || "no owner"} · {o._count.agents} agents · {o._count.whatsappPhoneNumbers} numbers · {o._count.conversations} convs · {o._count.leads} leads · updated {relTime(o.updatedAt)}
                  </p>
                </div>
                <SuspendWorkspaceButton id={o.id} suspended={!!o.suspendedAt} />
              </CardContent></Card>
            ))}
          </div>
          <Pagination page={page} hasMore={hasMore} baseHref={`/admin/workspaces?q=${encodeURIComponent(q)}`} />
        </>
      ) : <EmptyState title="No workspaces" description="No workspace matches this search." />}
    </div>
  );
}
