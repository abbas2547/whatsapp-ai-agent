import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getAdminContext, logAdminAction } from "@/lib/admin";
import { getClientIp } from "@/lib/rate-limit";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getAdminContext();
  if (!ctx) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const reason = z.object({ reason: z.string().max(300).optional() }).safeParse(body);
  const org = await db.organization.findUnique({ where: { id }, select: { id: true, name: true } });
  if (!org) return NextResponse.json({ error: "Not found" }, { status: 404 });
  await db.organization.update({ where: { id }, data: { suspendedAt: new Date(), suspendedReason: reason.success ? reason.data.reason?.slice(0, 300) : undefined } });
  await logAdminAction({ actorId: ctx.userId, actorEmail: ctx.email, action: "WORKSPACE_SUSPENDED", resource: "workspace", resourceId: id, workspaceId: id, ip: getClientIp(req), metadata: { name: org.name } });
  return NextResponse.json({ ok: true });
}
