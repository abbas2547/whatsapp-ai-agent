import { NextResponse } from "next/server";
import { requireOrgContext } from "@/lib/tenant";
import { db } from "@/lib/db";
import { getPlan } from "@/services/billing/plans";

/**
 * Invoices are derived from real successful payments only — no invented
 * documents. Invoice number = immutable payment reference.
 */
export async function GET() {
  try {
    const ctx = await requireOrgContext();
    const payments = await db.payment.findMany({
      where: { organizationId: ctx.organizationId, status: "SUCCESS" },
      select: {
        reference: true,
        planId: true,
        billingInterval: true,
        amountPaise: true,
        currency: true,
        paymentMethod: true,
        providerPaymentId: true,
        customerEmail: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
    return NextResponse.json({
      ok: true,
      invoices: payments.map((p) => ({
        invoiceNo: p.reference,
        planName: getPlan(p.planId)?.name ?? p.planId,
        billingInterval: p.billingInterval,
        amountPaise: p.amountPaise,
        currency: p.currency,
        paymentMethod: p.paymentMethod,
        providerPaymentId: p.providerPaymentId,
        customerEmail: p.customerEmail,
        issuedAt: p.createdAt,
      })),
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not load invoices." },
      { status: 500 },
    );
  }
}
