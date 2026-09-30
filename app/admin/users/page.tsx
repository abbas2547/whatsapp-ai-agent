import Link from "next/link";
import { redirect } from "next/navigation";
import { db, Prisma } from "@/lib/db";
import { getAdminContext } from "@/lib/admin";
import { isOnline, onlineSinceDate } from "@/lib/presence";
import { Card, CardContent } from "@/components/ui/card";
import { Badge, EmptyState, PageHeader } from "@/components/ui/badge";
import { Pagination } from "@/components/ui/stat";
import { relTime } from "@/components/format";

const PAGE = 20;

export default async function AdminUsersPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const ctx = await getAdminContext();
  if (!ctx) redirect("/dashboard");
  const sp = await searchParams;
  const q = (sp.q || "").trim().slice(0, 100);
  const filter = sp.filter || "all";
  const sort = sp.sort || "newest";
  const page = Math.max(1, Number(sp.page || "1") || 1);
  const onlineSince = onlineSinceDate();

  const and: Prisma.UserWhereInput[] = [];
  if (q) and.push({ OR: [{ email: { contains: q, mode: "insensitive" } }, { name: { contains: q, mode: "insensitive" } }] });
  if (filter === "online") and.push({ lastSeenAt: { gte: onlineSince } });
  if (filter === "offline") and.push({ OR: [{ lastSeenAt: { lt: onlineSince } }, { lastSeenAt: null }] });
  const where: Prisma.UserWhereInput = and.length ? { AND: and } : {};

  const orderBy =
    sort === "oldest" ? { createdAt: "asc" as const }
    : sort === "active" ? { lastSeenAt: "desc" as const }
    : { createdAt: "desc" as const };

  const [total, users] = await Promise.all([
    db.user.count({ where }),
    db.user.findMany({
      where,
      orderBy,
      skip: (page - 1) * PAGE,
      take: PAGE + 1,
      select: {
        id: true, name: true, email: true, image: true, createdAt: true, lastLoginAt: true, lastSeenAt: true,
        memberships: { select: { organizationId: true, role: true, organization: { select: { name: true } } }, take: 1 },
        _count: { select: { assignedConversations: true, assignedLeads: true } },
      },
    }),
  ]);
  const hasMore = users.length > PAGE;
  const rows = users.slice(0, PAGE);
  const ids = rows.map((u) => u.id);
  const [convCounts, leadCounts] = await Promise.all([
    db.conversation.groupBy({ by: ["assignedUserId"], where: { assignedUserId: { in: ids } }, _count: true }).catch(() => []),
    db.lead.groupBy({ by: ["assignedUserId"], where: { assignedUserId: { in: ids } }, _count: true }).catch(() => []),
  ]);
  void total; void convCounts; void leadCounts;

  const base = `/admin/users?q=${encodeURIComponent(q)}&filter=${filter}&sort=${sort}`;

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Users" description="Every account with live presence. Data comes from the database — never faked." />
      <form method="get" className="flex flex-wrap gap-2">
        <input name="q" defaultValue={q} placeholder="Search name or email…" className="h-10 min-w-0 flex-1 rounded-xl border border-input bg-card px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring sm:max-w-xs" />
        <select name="filter" defaultValue={filter} className="h-10 rounded-xl border border-input bg-card px-3 text-sm">
          <option value="all">All</option><option value="online">Online</option><option value="offline">Offline</option>
        </select>
        <select name="sort" defaultValue={sort} className="h-10 rounded-xl border border-input bg-card px-3 text-sm">
          <option value="newest">Newest</option><option value="oldest">Oldest</option><option value="active">Last active</option>
        </select>
        <button className="h-10 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground">Search</button>
      </form>
      {rows.length ? (
        <>
          <Card><CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-left text-sm">
                <thead><tr className="border-b border-border text-xs text-muted-foreground">
                  <th className="px-4 py-3 font-medium">User</th><th className="px-4 py-3 font-medium">Workspace</th>
                  <th className="px-4 py-3 font-medium">Presence</th><th className="px-4 py-3 font-medium">Joined</th><th className="px-4 py-3" />
                </tr></thead>
                <tbody className="divide-y divide-border">
                  {rows.map((u) => {
                    const online = isOnline(u.lastSeenAt);
                    return (
                      <tr key={u.id} className="hover:bg-muted/40">
                        <td className="px-4 py-3"><p className="font-medium">{u.name || "—"}</p><p className="text-xs text-muted-foreground">{u.email}</p></td>
                        <td className="px-4 py-3 text-xs">{u.memberships[0]?.organization.name || "—"}</td>
                        <td className="px-4 py-3"><Badge variant={online ? "success" : "secondary"}>{online ? "● Online" : "○ Offline"}</Badge><p className="mt-0.5 text-[11px] text-muted-foreground">{u.lastSeenAt ? relTime(u.lastSeenAt) : "never"}</p></td>
                        <td className="px-4 py-3 text-xs text-muted-foreground">{relTime(u.createdAt)}</td>
                        <td className="px-4 py-3 text-right"><Link href={`/admin/users/${u.id}`} className="text-xs font-semibold text-primary hover:underline">Open</Link></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardContent></Card>
          <Pagination page={page} hasMore={hasMore} baseHref={base} />
        </>
      ) : <EmptyState title="No users found" description="Try a different search or filter." />}
    </div>
  );
}
