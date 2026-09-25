import { NextResponse } from "next/server";
import { requireOrgContext } from "@/lib/tenant";
import { AppError } from "@/lib/errors";
import { verifyAndSyncOrder } from "@/services/billing/payments";
import { getActiveSubscription, getUsageSummary } from "@/services/billing/entitlements";
import { getPlan } from "@/services/billing/plans";
import { db } from "@/lib/db";

function statusFor(error: unknown): number {
  if (error instanceof AppError) return error.status;
  return 500;
}

/**
 * Dual purpose:
 *  - ?order_id=… → verify that order against Cashfree (ownership-checked),
 *    sync local state, and report the verified outcome.
 *  - no param → current subscription + usage summary (safe for UI polling).
 */
export async function GET(request: Request) {
  try {
    const ctx = await requireOrgContext();
    const orderId = new URL(request.url).searchParams.get("order_id");

    if (orderId) {
      const verified = await verifyAndSyncOrder({
        organizationId: ctx.organizationId,
        userId: ctx.userId,
        orderId,
      });
      return NextResponse.json({ ok: true, order: verified });
    }

    const [sub, usage, payments] = await Promise.all([
      getActiveSubscription(ctx.organizationId),
      getUsageSummary(ctx.organizationId),
      db.payment.findMany({
        where: { organizationId: ctx.organizationId },
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
    ]);
    const plan = getPlan(sub.planId);
    return NextResponse.json({
      ok: true,
      subscription: {
        planId: sub.planId,
        planName: plan?.name ?? sub.planId,
        status: sub.status,
        effectiveStatus: sub.effectiveStatus,
        billingInterval: sub.billingInterval,
        currentPeriodStart: sub.currentPeriodStart,
        currentPeriodEnd: sub.currentPeriodEnd,
        cancelAtPeriodEnd: sub.cancelAtPeriodEnd,
      },
      usage,
      payments,
    });
  } catch (error) {
    const status = statusFor(error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not load billing status." },
      { status },
    );
  }
}
