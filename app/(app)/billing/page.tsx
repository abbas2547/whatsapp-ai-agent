import type { Metadata } from "next";
import Link from "next/link";
import { requireSessionOrRedirect } from "@/app/actions";
import { db } from "@/lib/db";
import { PageHeader, EmptyState } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SubscriptionCard } from "@/components/billing/subscription-card";
import { UsageCard } from "@/components/billing/usage-card";
import { getActiveSubscription, getUsageSummary } from "@/services/billing/entitlements";
import { getPlan, formatINR, planPricePaise } from "@/services/billing/plans";
import { fmtDateTime } from "@/components/format";
import { ReceiptText, Download } from "lucide-react";

export const metadata: Metadata = { title: "Billing" };

function paymentBadge(status: string) {
  switch (status) {
    case "SUCCESS":
      return <Badge variant="success">Paid</Badge>;
    case "PENDING":
    case "PROCESSING":
      return <Badge variant="warning">{status === "PENDING" ? "Pending" : "Processing"}</Badge>;
    case "FAILED":
      return <Badge variant="danger">Failed</Badge>;
    case "CANCELED":
      return <Badge variant="secondary">Canceled</Badge>;
    case "EXPIRED":
      return <Badge variant="secondary">Expired</Badge>;
    default:
      return <Badge variant="secondary">{status}</Badge>;
  }
}

export default async function BillingPage() {
  const session = await requireSessionOrRedirect();
  const orgId = session.user.organizationId!;

  const [sub, usage, payments, invoices] = await Promise.all([
    getActiveSubscription(orgId),
    getUsageSummary(orgId),
    db.payment.findMany({
      where: { organizationId: orgId },
      select: {
        id: true,
        reference: true,
        planId: true,
        billingInterval: true,
        amountPaise: true,
        currency: true,
        status: true,
        paymentMethod: true,
        providerPaymentId: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
    db.payment.findMany({
      where: { organizationId: orgId, status: "SUCCESS" },
      select: { reference: true, planId: true, billingInterval: true, amountPaise: true, createdAt: true },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
  ]);

  const plan = getPlan(sub.planId) ?? getPlan("free")!;
  const pricePaise = sub.planId === "free" ? 0 : planPricePaise(plan, sub.billingInterval ?? "monthly");

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-5">
      <PageHeader
        title="Billing & subscription"
        description="Your plan, real usage, payment history and invoices."
        actions={
          <Button asChild size="sm" variant="outline">
            <Link href="/pricing">View plans</Link>
          </Button>
        }
      />

      <div className="grid gap-5 lg:grid-cols-2">
        <SubscriptionCard sub={sub} plan={plan} pricePaise={pricePaise} />
        <UsageCard
          usage={usage}
          title="Current usage"
          subtitle={
            usage.periodEnd
              ? `Billing period ends ${usage.periodEnd.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}`
              : "Trailing 30 days (Free plan)"
          }
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Payment history</CardTitle>
          <CardDescription>Every checkout attempt on this workspace — verified outcomes only.</CardDescription>
        </CardHeader>
        <CardContent>
          {payments.length ? (
            <>
              {/* Desktop table */}
              <div className="hidden overflow-x-auto md:block">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-border text-xs uppercase tracking-wider text-muted-foreground">
                      <th className="pb-2.5 pr-3 font-semibold">Date</th>
                      <th className="pb-2.5 pr-3 font-semibold">Description</th>
                      <th className="pb-2.5 pr-3 font-semibold">Amount</th>
                      <th className="pb-2.5 pr-3 font-semibold">Status</th>
                      <th className="pb-2.5 font-semibold">Payment ID</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {payments.map((p) => (
                      <tr key={p.id}>
                        <td className="whitespace-nowrap py-3 pr-3 tabular-nums text-muted-foreground">{fmtDateTime(p.createdAt)}</td>
                        <td className="py-3 pr-3">
                          <span className="font-medium capitalize">{getPlan(p.planId)?.name ?? p.planId}</span>{" "}
                          <span className="text-muted-foreground">· {p.billingInterval}</span>
                          <span className="block font-mono text-[11px] text-muted-foreground">{p.reference}</span>
                        </td>
                        <td className="whitespace-nowrap py-3 pr-3 font-semibold tabular-nums">{formatINR(p.amountPaise)}</td>
                        <td className="py-3 pr-3">{paymentBadge(p.status)}</td>
                        <td className="max-w-40 truncate py-3 font-mono text-xs text-muted-foreground">{p.providerPaymentId ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {/* Mobile cards */}
              <div className="flex flex-col gap-2.5 md:hidden">
                {payments.map((p) => (
                  <div key={p.id} className="rounded-2xl border border-border p-3.5">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-semibold capitalize">
                        {getPlan(p.planId)?.name ?? p.planId} · {p.billingInterval}
                      </p>
                      {paymentBadge(p.status)}
                    </div>
                    <p className="mt-1 text-xs tabular-nums text-muted-foreground">{fmtDateTime(p.createdAt)}</p>
                    <p className="mt-1 text-sm font-bold tabular-nums">{formatINR(p.amountPaise)}</p>
                    <p className="font-mono text-[11px] text-muted-foreground">{p.reference}</p>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <EmptyState
              compact
              icon={ReceiptText}
              title="No payments yet"
              description="You're on the Free plan. Your payment history will appear here after your first upgrade."
              action={
                <Button asChild size="sm">
                  <Link href="/pricing">View plans</Link>
                </Button>
              }
            />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Invoices</CardTitle>
          <CardDescription>Receipts generated from successful payments. Print or save as PDF from your browser.</CardDescription>
        </CardHeader>
        <CardContent>
          {invoices.length ? (
            <div className="flex flex-col divide-y divide-border">
              {invoices.map((inv) => (
                <div key={inv.reference} className="flex items-center justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <p className="font-mono text-sm font-semibold">{inv.reference}</p>
                    <p className="text-xs text-muted-foreground">
                      {getPlan(inv.planId)?.name ?? inv.planId} · {inv.billingInterval} · {fmtDateTime(inv.createdAt)}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2.5">
                    <span className="text-sm font-bold tabular-nums">{formatINR(inv.amountPaise)}</span>
                    <Button asChild variant="outline" size="sm">
                      <Link href={`/billing/invoices/${inv.reference}`}>
                        <Download /> Receipt
                      </Link>
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No invoices yet — they appear here after a successful payment.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
