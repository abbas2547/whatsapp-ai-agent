import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getAdminContext, logAdminAction } from "@/lib/admin";
import { getClientIp } from "@/lib/rate-limit";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getAdminContext();
  if (!ctx) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  const org = await db.organization.findUnique({ where: { id }, select: { id: true } });
  if (!org) return NextResponse.json({ error: "Not found" }, { status: 404 });
  await db.organization.update({ where: { id }, data: { suspendedAt: null, suspendedReason: null } });
  await logAdminAction({ actorId: ctx.userId, actorEmail: ctx.email, action: "WORKSPACE_REACTIVATED", resource: "workspace", resourceId: id, workspaceId: id, ip: getClientIp(req) });
  return NextResponse.json({ ok: true });
}
