import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getAdminContext } from "@/lib/admin";
import { Card, CardContent } from "@/components/ui/card";
import { Badge, EmptyState, PageHeader } from "@/components/ui/badge";
import { Pagination } from "@/components/ui/stat";
import { relTime } from "@/components/format";

const PAGE = 20;

export default async function AdminLeadsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const ctx = await getAdminContext();
  if (!ctx) redirect("/dashboard");
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page || "1") || 1);
  const rows = await db.lead.findMany({
    orderBy: { createdAt: "desc" }, skip: (page - 1) * PAGE, take: PAGE + 1,
    include: { organization: { select: { name: true } } },
  });
  const hasMore = rows.length > PAGE;
  const list = rows.slice(0, PAGE);
  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Leads" description="Opportunities captured by AI across workspaces." />
      {list.length ? (
        <>
          <Card><CardContent className="flex flex-col divide-y divide-border p-0 px-4">
            {list.map((l) => (
              <div key={l.id} className="flex items-center justify-between gap-3 py-3">
                <div className="min-w-0"><p className="truncate text-sm font-medium">{l.name || l.phone || l.email || "Unnamed lead"}</p>
                  <p className="truncate text-xs text-muted-foreground">{l.organization.name} · {l.service || "no service"} · score {l.score} · {relTime(l.createdAt)}</p></div>
                <Badge variant={l.status === "WON" ? "success" : l.status === "LOST" ? "danger" : "secondary"}>{l.status}</Badge>
              </div>
            ))}
          </CardContent></Card>
          <Pagination page={page} hasMore={hasMore} baseHref="/admin/leads" />
        </>
      ) : <EmptyState title="No leads" description="Qualified leads will appear here." />}
    </div>
  );
}
