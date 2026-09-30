import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getAdminContext, logAdminAction } from "@/lib/admin";
import { getClientIp } from "@/lib/rate-limit";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getAdminContext();
  if (!ctx) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  const sess = await db.userSession.findUnique({ where: { id }, select: { id: true, userId: true, revokedAt: true } });
  if (!sess) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!sess.revokedAt) {
    await db.userSession.update({ where: { id }, data: { revokedAt: new Date() } });
    // Force logout: push lastLogoutAt so heartbeat-gated UI treats them offline.
    await db.user.update({ where: { id: sess.userId }, data: { lastLogoutAt: new Date() } }).catch(() => {});
    await logAdminAction({ actorId: ctx.userId, actorEmail: ctx.email, action: "SESSION_REVOKED", resource: "session", resourceId: id, workspaceId: null, ip: getClientIp(req), metadata: { targetUser: sess.userId } });
  }
  return NextResponse.json({ ok: true });
}
