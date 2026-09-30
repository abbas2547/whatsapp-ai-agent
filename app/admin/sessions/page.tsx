import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getAdminContext } from "@/lib/admin";
import { isOnline } from "@/lib/presence";
import { Card, CardContent } from "@/components/ui/card";
import { Badge, EmptyState, PageHeader } from "@/components/ui/badge";
import { Pagination } from "@/components/ui/stat";
import { relTime } from "@/components/format";
import { RevokeSessionButton } from "@/components/admin/admin-actions";

const PAGE = 20;

export default async function AdminSessionsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const ctx = await getAdminContext();
  if (!ctx) redirect("/dashboard");
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page || "1") || 1);
  const rows = await db.userSession.findMany({
    orderBy: { lastSeenAt: "desc" }, skip: (page - 1) * PAGE, take: PAGE + 1,
    include: { user: { select: { name: true, email: true, lastSeenAt: true } } },
  });
  const hasMore = rows.length > PAGE;
  const list = rows.slice(0, PAGE);
  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Sessions" description="Active device sessions. Revoking invalidates the session server-side immediately." />
      {list.length ? (
        <>
          <div className="grid gap-3">
            {list.map((s) => (
              <Card key={s.id}><CardContent className="flex flex-wrap items-center gap-3 p-4">
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2 text-sm font-semibold">{s.user.name || s.user.email}
                    <Badge variant={s.revokedAt ? "danger" : isOnline(s.lastSeenAt) ? "success" : "secondary"}>
                      {s.revokedAt ? "Revoked" : isOnline(s.lastSeenAt) ? "● Online" : "○ Offline"}
                    </Badge>
                  </p>
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">
                    {s.user.email} · {s.deviceLabel || s.userAgent?.slice(0, 50) || "unknown device"} · {s.ip || "no ip"} · last active {relTime(s.lastSeenAt)}
                  </p>
                </div>
                {!s.revokedAt ? <RevokeSessionButton id={s.id} /> : null}
              </CardContent></Card>
            ))}
          </div>
          <Pagination page={page} hasMore={hasMore} baseHref="/admin/sessions" />
        </>
      ) : <EmptyState title="No sessions" description="Device sessions are recorded from the next sign-in onwards." />}
    </div>
  );
}
