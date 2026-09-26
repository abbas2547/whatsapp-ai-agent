import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSessionOrRedirect } from "@/app/actions/session";
import { db } from "@/lib/db";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getPlan, formatINR } from "@/services/billing/plans";
import { fmtDateTime } from "@/components/format";
import { ArrowLeft } from "lucide-react";
import { PrintButton } from "@/components/billing/print-button";

export const metadata: Metadata = { title: "Receipt" };

/** Printable receipt rendered from the verified successful payment — real data only. */
export default async function InvoicePage({ params }: { params: Promise<{ reference: string }> }) {
  const session = await requireSessionOrRedirect();
  const orgId = session.user.organizationId!;
  const { reference } = await params;

  const [payment, org] = await Promise.all([
    db.payment.findFirst({
      where: { organizationId: orgId, reference, status: "SUCCESS" },
    }),
    db.organization.findUnique({ where: { id: orgId }, select: { name: true } }),
  ]);
  if (!payment) notFound();
  const plan = getPlan(payment.planId);

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-4">
      <div className="flex items-center justify-between print:hidden">
        <Link href="/billing" className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Back to billing
        </Link>
        <PrintButton />
      </div>

      <Card>
        <CardContent className="p-8">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-lg font-extrabold tracking-tight">eluue ai agent</p>
              <p className="text-xs text-muted-foreground">WhatsApp AI Employee · Payment receipt</p>
            </div>
            <Badge variant="success">Paid</Badge>
          </div>

          <div className="mt-6 grid gap-x-8 gap-y-3 text-sm sm:grid-cols-2">
            <div>
              <p className="text-xs uppercase tracking-wider text-muted-foreground">Receipt no.</p>
              <p className="font-mono font-semibold">{payment.reference}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wider text-muted-foreground">Date</p>
              <p className="font-medium tabular-nums">{fmtDateTime(payment.createdAt)}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wider text-muted-foreground">Billed to</p>
              <p className="font-medium">{org?.name ?? "—"}</p>
              <p className="text-xs text-muted-foreground">{payment.customerEmail ?? ""}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wider text-muted-foreground">Provider payment ID</p>
              <p className="font-mono text-xs">{payment.providerPaymentId ?? "—"}</p>
            </div>
          </div>

          <div className="mt-6 border-t border-border pt-4">
            <div className="flex items-baseline justify-between gap-2">
              <p className="font-semibold">
                {plan?.name ?? payment.planId} <span className="font-normal text-muted-foreground">· {payment.billingInterval}</span>
              </p>
              <p className="text-lg font-extrabold tabular-nums">{formatINR(payment.amountPaise)}</p>
            </div>
            {payment.paymentMethod && (
              <p className="mt-1 text-xs uppercase text-muted-foreground">Paid via {payment.paymentMethod}</p>
            )}
            <p className="mt-1 text-xs text-muted-foreground">
              Amount in {payment.currency}. GST invoice available on request from support.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
