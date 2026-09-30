import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getAdminContext } from "@/lib/admin";
import { Card, CardContent } from "@/components/ui/card";
import { Badge, EmptyState, PageHeader } from "@/components/ui/badge";
import { Pagination } from "@/components/ui/stat";
import { fmtDateTime } from "@/components/format";
import { ExtendSubscriptionButton } from "@/components/admin/admin-actions";

const PAGE = 20;

export default async function AdminSubscriptionsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const ctx = await getAdminContext();
  if (!ctx) redirect("/dashboard");
  const sp = await searchParams;
  const filter = sp.filter || "all";
  const page = Math.max(1, Number(sp.page || "1") || 1);
  const where = filter === "all" ? {} : { status: filter as never };
  const rows = await db.subscription.findMany({
    where, orderBy: { updatedAt: "desc" }, skip: (page - 1) * PAGE, take: PAGE + 1,
    include: { organization: { select: { id: true, name: true, members: { select: { user: { select: { email: true } } }, take: 1 } } } },
  });
  const hasMore = rows.length > PAGE;
  const list = rows.slice(0, PAGE);

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Subscriptions" description="Database is the source of truth after verified payment webhooks. Never faked." />
      <form method="get" className="flex gap-2">
        <select name="filter" defaultValue={filter} className="h-10 rounded-xl border border-input bg-card px-3 text-sm">
          {["all", "ACTIVE", "TRIALING", "PENDING", "PAST_DUE", "PAUSED", "CANCELED", "EXPIRED"].map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <button className="h-10 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground">Filter</button>
      </form>
      {list.length ? (
        <>
          <div className="grid gap-3">
            {list.map((s) => (
              <Card key={s.id}><CardContent className="flex flex-wrap items-center gap-3 p-4">
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2 text-sm font-semibold">{s.organization.name}
                    <Badge variant={s.status === "ACTIVE" ? "success" : s.status === "CANCELED" || s.status === "EXPIRED" ? "danger" : "warning"}>{s.status}</Badge>
                    <Badge variant="secondary">{s.planId}{s.billingInterval ? ` · ${s.billingInterval}` : ""}</Badge>
                  </p>
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">
                    {s.organization.members[0]?.user.email || ""} · {s.provider}{s.providerOrderId ? ` · ${s.providerOrderId}` : ""} · ends {fmtDateTime(s.currentPeriodEnd)}
                  </p>
                </div>
                <ExtendSubscriptionButton organizationId={s.organizationId} />
              </CardContent></Card>
            ))}
          </div>
          <Pagination page={page} hasMore={hasMore} baseHref={`/admin/subscriptions?filter=${filter}`} />
        </>
      ) : <EmptyState title="No subscriptions" description="No subscription rows match this filter." />}
    </div>
  );
}
