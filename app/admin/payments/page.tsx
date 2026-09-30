import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getAdminContext } from "@/lib/admin";
import { Card, CardContent } from "@/components/ui/card";
import { Badge, EmptyState, PageHeader } from "@/components/ui/badge";
import { Pagination } from "@/components/ui/stat";
import { fmtDateTime } from "@/components/format";

const PAGE = 20;

export default async function AdminPaymentsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const ctx = await getAdminContext();
  if (!ctx) redirect("/dashboard");
  const sp = await searchParams;
  const filter = sp.filter || "all";
  const page = Math.max(1, Number(sp.page || "1") || 1);
  const where = filter === "all" ? {} : { status: filter as never };
  const rows = await db.payment.findMany({
    where, orderBy: { createdAt: "desc" }, skip: (page - 1) * PAGE, take: PAGE + 1,
    include: { organization: { select: { name: true } } },
  });
  const hasMore = rows.length > PAGE;
  const list = rows.slice(0, PAGE);

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Payments" description="Actual Cashfree / database records. Frontend success pages are never trusted." />
      <form method="get" className="flex gap-2">
        <select name="filter" defaultValue={filter} className="h-10 rounded-xl border border-input bg-card px-3 text-sm">
          {["all", "SUCCESS", "FAILED", "PENDING", "PROCESSING", "CANCELED", "EXPIRED"].map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <button className="h-10 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground">Filter</button>
      </form>
      {list.length ? (
        <>
          <Card><CardContent className="p-0"><div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead><tr className="border-b border-border text-xs text-muted-foreground">
                <th className="px-4 py-3 font-medium">Payment</th><th className="px-4 py-3 font-medium">Workspace</th>
                <th className="px-4 py-3 font-medium">Order</th><th className="px-4 py-3 font-medium">Status</th><th className="px-4 py-3 font-medium">Time</th>
              </tr></thead>
              <tbody className="divide-y divide-border">
                {list.map((p) => (
                  <tr key={p.id} className="hover:bg-muted/40">
                    <td className="px-4 py-3"><p className="font-semibold">₹{(p.amountPaise / 100).toLocaleString("en-IN")} {p.currency}</p><p className="text-xs text-muted-foreground">{p.planId} · {p.billingInterval}</p></td>
                    <td className="px-4 py-3 text-xs">{p.organization?.name || p.organizationId.slice(0, 8)}</td>
                    <td className="px-4 py-3 text-xs font-mono">{p.providerOrderId}</td>
                    <td className="px-4 py-3"><Badge variant={p.status === "SUCCESS" ? "success" : p.status === "FAILED" ? "danger" : "warning"}>{p.status}</Badge></td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">{fmtDateTime(p.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div></CardContent></Card>
          <Pagination page={page} hasMore={hasMore} baseHref={`/admin/payments?filter=${filter}`} />
        </>
      ) : <EmptyState title="No payments" description="Verified payments will appear here." />}
    </div>
  );
}
