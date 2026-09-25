import { NextResponse } from "next/server";
import { requireOrgContext, assertAdmin } from "@/lib/tenant";
import { AppError } from "@/lib/errors";
import { cancelSubscription } from "@/services/billing/payments";

/** Cancel at period end — current paid period stays active until expiry. */
export async function POST() {
  try {
    const ctx = await requireOrgContext();
    assertAdmin(ctx);
    await cancelSubscription({ organizationId: ctx.organizationId, userId: ctx.userId });
    return NextResponse.json({
      ok: true,
      message: "Subscription will lapse to the Free plan at the end of the current paid period.",
    });
  } catch (error) {
    const status = error instanceof AppError ? error.status : 500;
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not cancel subscription." },
      { status },
    );
  }
}
