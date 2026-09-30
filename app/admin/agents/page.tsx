import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getAdminContext } from "@/lib/admin";
import { Card, CardContent } from "@/components/ui/card";
import { Badge, EmptyState, PageHeader } from "@/components/ui/badge";
import { Pagination } from "@/components/ui/stat";
import { relTime } from "@/components/format";

const PAGE = 20;

export default async function AdminAgentsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const ctx = await getAdminContext();
  if (!ctx) redirect("/dashboard");
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page || "1") || 1);
  const rows = await db.agent.findMany({
    orderBy: { updatedAt: "desc" }, skip: (page - 1) * PAGE, take: PAGE + 1,
    select: { id: true, name: true, status: true, goal: true, updatedAt: true, createdAt: true, organization: { select: { name: true } }, _count: { select: { conversations: true } } },
  });
  const hasMore = rows.length > PAGE;
  const list = rows.slice(0, PAGE);
  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="AI Agents" description="Configuration summaries + usage. API keys are never exposed." />
      {list.length ? (
        <>
          <div className="grid gap-3">
            {list.map((a) => (
              <Card key={a.id}><CardContent className="flex flex-wrap items-center gap-3 p-4">
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2 text-sm font-semibold">{a.name}
                    <Badge variant={a.status === "ACTIVE" ? "success" : a.status === "PAUSED" ? "warning" : "secondary"}>{a.status}</Badge>
                    <Badge variant="secondary">{a.goal}</Badge>
                  </p>
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">{a.organization.name} · {a._count.conversations} convs · updated {relTime(a.updatedAt)}</p>
                </div>
              </CardContent></Card>
            ))}
          </div>
          <Pagination page={page} hasMore={hasMore} baseHref="/admin/agents" />
        </>
      ) : <EmptyState title="No agents" description="Published AI employees will appear here." />}
    </div>
  );
}
