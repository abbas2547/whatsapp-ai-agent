import { NextResponse } from "next/server";
import { z } from "zod";
import { requireOrgContext, assertCanManageAgents } from "@/lib/tenant";
import { rateLimit } from "@/lib/rate-limit";
import { AppError } from "@/lib/errors";
import { createBillingOrder } from "@/services/billing/payments";

const bodySchema = z.object({
  planId: z.string().min(1).max(32),
  interval: z.string().min(1).max(16),
  customerPhone: z.string().min(1).max(20),
});

function statusFor(error: unknown): number {
  if (error instanceof AppError) return error.status;
  // CashfreeError and similar provider errors carry their own HTTP status.
  const status = (error as { status?: unknown } | null)?.status;
  if (typeof status === "number" && Number.isInteger(status) && status >= 400 && status < 600) return status;
  return 500;
}

/**
 * Creates a pending payment + Cashfree order. The client sends ONLY
 * { planId, interval, customerPhone } — amount/price are resolved
 * server-side from the plan catalog. Never trust client amounts.
 */
export async function POST(request: Request) {
  try {
    const ctx = await requireOrgContext();
    assertCanManageAgents(ctx);
    const limited = rateLimit(`billing:${ctx.organizationId}`, 10, 60_000);
    if (!limited.success) {
      return NextResponse.json(
        { error: "Too many checkout attempts. Please wait a minute and try again." },
        { status: 429 },
      );
    }
    const json = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    if (!json) return NextResponse.json({ error: "Invalid request." }, { status: 400 });
    const parsed = bodySchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ error: "Please choose a plan, billing period and phone number." }, { status: 400 });
    }
    const result = await createBillingOrder({
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      userEmail: ctx.email,
      planId: parsed.data.planId,
      interval: parsed.data.interval,
      customerPhone: parsed.data.customerPhone,
    });
    // Only safe checkout fields leave the server — never secrets.
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    const status = statusFor(error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not start checkout." },
      { status },
    );
  }
}
