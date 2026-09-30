import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getAdminContext } from "@/lib/admin";
import { Card, CardContent } from "@/components/ui/card";
import { Badge, EmptyState, PageHeader } from "@/components/ui/badge";
import { Pagination } from "@/components/ui/stat";
import { relTime } from "@/components/format";

const PAGE = 20;

export default async function AdminConversationsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const ctx = await getAdminContext();
  if (!ctx) redirect("/dashboard");
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page || "1") || 1);
  const rows = await db.conversation.findMany({
    orderBy: { lastMessageAt: "desc" }, skip: (page - 1) * PAGE, take: PAGE + 1,
    include: { contact: { select: { name: true, phone: true } }, organization: { select: { name: true } }, _count: { select: { messages: true } } },
  });
  const hasMore = rows.length > PAGE;
  const list = rows.slice(0, PAGE);
  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Conversations" description="Live conversation states across all workspaces." />
      {list.length ? (
        <>
          <Card><CardContent className="flex flex-col divide-y divide-border p-0 px-4">
            {list.map((c) => (
              <div key={c.id} className="flex items-center justify-between gap-3 py-3">
                <div className="min-w-0"><p className="truncate text-sm font-medium">{c.contact.name || c.contact.phone}</p>
                  <p className="truncate text-xs text-muted-foreground">{c.organization.name} · {c._count.messages} msgs · {relTime(c.lastMessageAt)}</p></div>
                <Badge variant={c.status === "AI_ACTIVE" ? "success" : c.status === "RESOLVED" ? "secondary" : "warning"}>{c.status}</Badge>
              </div>
            ))}
          </CardContent></Card>
          <Pagination page={page} hasMore={hasMore} baseHref="/admin/conversations" />
        </>
      ) : <EmptyState title="No conversations" description="Customer conversations will appear here." />}
    </div>
  );
}
