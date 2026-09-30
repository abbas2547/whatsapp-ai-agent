import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getAdminContext, logAdminAction } from "@/lib/admin";
import { getClientIp } from "@/lib/rate-limit";

export async function POST(req: NextRequest, { params }: { params: Promise<{ orgId: string }> }) {
  const ctx = await getAdminContext();
  if (!ctx) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { orgId } = await params;
  const body = await req.json().catch(() => ({}));
  const parsed = z.object({ days: z.number().int().min(1).max(365).default(30) }).safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  const sub = await db.subscription.findUnique({ where: { organizationId: orgId } });
  if (!sub) return NextResponse.json({ error: "No subscription for workspace" }, { status: 404 });
  const base = sub.currentPeriodEnd && sub.currentPeriodEnd.getTime() > Date.now() ? sub.currentPeriodEnd : new Date();
  const next = new Date(base.getTime() + parsed.data.days * 24 * 60 * 60 * 1000);
  await db.subscription.update({ where: { organizationId: orgId }, data: { currentPeriodEnd: next, status: "ACTIVE" } });
  await logAdminAction({ actorId: ctx.userId, actorEmail: ctx.email, action: "SUBSCRIPTION_EXTENDED", resource: "subscription", resourceId: sub.id, workspaceId: orgId, ip: getClientIp(req), metadata: { days: parsed.data.days } });
  return NextResponse.json({ ok: true, currentPeriodEnd: next });
}
