import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getAdminContext } from "@/lib/admin";
import { Card, CardContent } from "@/components/ui/card";
import { Badge, EmptyState, PageHeader } from "@/components/ui/badge";
import { relTime } from "@/components/format";

export default async function AdminKnowledgePage() {
  const ctx = await getAdminContext();
  if (!ctx) redirect("/dashboard");
  const bases = await db.knowledgeBase.findMany({
    orderBy: { updatedAt: "desc" }, take: 50,
    include: { organization: { select: { name: true } }, _count: { select: { documents: true, chunks: true } } },
  });
  const byStatus = await db.knowledgeDocument.groupBy({ by: ["status"], _count: { status: true } });
  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Knowledge" description="Operational status only — private document contents are never listed here." />
      <Card><CardContent className="flex flex-wrap gap-2 p-4">
        {byStatus.length ? byStatus.map((s) => (
          <Badge key={s.status} variant={s.status === "READY" ? "success" : s.status === "FAILED" ? "danger" : "warning"}>{s.status}: {s._count.status}</Badge>
        )) : <span className="text-sm text-muted-foreground">No documents yet.</span>}
      </CardContent></Card>
      {bases.length ? (
        <div className="grid gap-3">
          {bases.map((b) => (
            <Card key={b.id}><CardContent className="flex flex-wrap items-center gap-3 p-4">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">{b.name}</p>
                <p className="mt-0.5 truncate text-xs text-muted-foreground">{b.organization.name} · {b._count.documents} docs · {b._count.chunks} chunks · updated {relTime(b.updatedAt)}</p>
              </div>
            </CardContent></Card>
          ))}
        </div>
      ) : <EmptyState title="No knowledge bases" description="Workspace knowledge bases will appear here." />}
    </div>
  );
}
