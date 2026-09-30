import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getAdminContext } from "@/lib/admin";
import { Card, CardContent } from "@/components/ui/card";
import { Badge, EmptyState, PageHeader } from "@/components/ui/badge";
import { Pagination } from "@/components/ui/stat";
import { fmtDateTime } from "@/components/format";

const PAGE = 30;

export default async function AdminAuditLogsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const ctx = await getAdminContext();
  if (!ctx) redirect("/dashboard");
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page || "1") || 1);
  const q = (sp.q || "").trim().slice(0, 80);
  const where = q ? { action: { contains: q, mode: "insensitive" as const } } : {};
  const rows = await db.adminAuditLog.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * PAGE, take: PAGE + 1 });
  const hasMore = rows.length > PAGE;
  const list = rows.slice(0, PAGE);
  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Audit Logs" description="Append-only admin + security trail. Cannot be edited from the app." />
      <form method="get" className="flex gap-2">
        <input name="q" defaultValue={q} placeholder="Filter by action…" className="h-10 min-w-0 flex-1 rounded-xl border border-input bg-card px-3 text-sm sm:max-w-xs" />
        <button className="h-10 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground">Filter</button>
      </form>
      {list.length ? (
        <>
          <Card><CardContent className="flex flex-col divide-y divide-border p-0 px-4">
            {list.map((l) => (
              <div key={l.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm">
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-2 font-mono text-xs"><Badge variant={l.result === "SUCCESS" ? "success" : l.result === "DENIED" ? "danger" : "warning"}>{l.action}</Badge>{l.resource ? <span className="text-muted-foreground">{l.resource}{l.resourceId ? ` · ${l.resourceId.slice(0, 12)}` : ""}</span> : null}</p>
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">{l.actorEmail || "system"} · {l.ip || "no ip"} · {fmtDateTime(l.createdAt)}</p>
                </div>
                <Badge variant="secondary">{l.result}</Badge>
              </div>
            ))}
          </CardContent></Card>
          <Pagination page={page} hasMore={hasMore} baseHref={`/admin/audit-logs?q=${encodeURIComponent(q)}`} />
        </>
      ) : <EmptyState title="No audit entries" description="Admin actions will be recorded here." />}
    </div>
  );
}
