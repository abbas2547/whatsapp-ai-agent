import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getAdminContext } from "@/lib/admin";
import { Card, CardContent } from "@/components/ui/card";
import { Badge, EmptyState, PageHeader } from "@/components/ui/badge";
import { fmtDateTime, relTime } from "@/components/format";

export default async function AdminWhatsAppPage() {
  const ctx = await getAdminContext();
  if (!ctx) redirect("/dashboard");
  const numbers = await db.whatsAppPhoneNumber.findMany({
    orderBy: { updatedAt: "desc" }, take: 100,
    include: {
      organization: { select: { id: true, name: true } },
      account: { select: { status: true, webhookVerified: true } },
      _count: { select: { conversations: true } },
    },
  });
  const lastWebhook = await db.processedWebhookEvent.findMany({ orderBy: { createdAt: "desc" }, take: 1 });

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="WhatsApp" description="Connection + webhook health from real rows. Secrets are never displayed." />
      {numbers.length ? (
        <div className="grid gap-3">
          {numbers.map((n) => {
            const connected = n.account?.status === "connected";
            return (
              <Card key={n.id}><CardContent className="flex flex-wrap items-center gap-3 p-4">
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2 text-sm font-semibold">{n.displayPhoneNumber}
                    <Badge variant={connected ? "success" : "danger"}>{connected ? "CONNECTED" : (n.account?.status || "UNKNOWN").toUpperCase()}</Badge>
                    {n.account?.webhookVerified ? <Badge variant="info">Webhook ✓</Badge> : <Badge variant="warning">Webhook unverified</Badge>}
                  </p>
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">
                    {n.organization.name} · {n.verifiedName || "no name"} · {n._count.conversations} convs · quality {n.qualityRating || "—"} · updated {relTime(n.updatedAt)}
                  </p>
                </div>
                <span className="text-[11px] text-muted-foreground">phone_number_id …{n.phoneNumberId.slice(-6)}</span>
              </CardContent></Card>
            );
          })}
        </div>
      ) : <EmptyState title="No WhatsApp numbers" description="Connected business numbers will appear here." />}
      <Card><CardContent className="p-4 text-xs text-muted-foreground">
        Last webhook event: {lastWebhook[0] ? `${fmtDateTime(lastWebhook[0].createdAt)} (${relTime(lastWebhook[0].createdAt)} · ${lastWebhook[0].source})` : "none recorded yet"}
      </CardContent></Card>
    </div>
  );
}
