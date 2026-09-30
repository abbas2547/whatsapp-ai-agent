import { NextRequest, NextResponse } from "next/server";
import type { Session } from "next-auth";
import { auth } from "@/auth";
import { isSessionRevoked } from "@/lib/session-guard";
import { db } from "@/lib/db";

async function revoked(session: Session | null) {
  return !!session?.user?.id && (await isSessionRevoked(session.user.id, session.user.iat));
}

/** Workspace notification center: list + mark read. Scoped to caller's org. */
export async function GET() {
  const session = await auth();
  const orgId = session?.user?.organizationId;
  if (!session?.user?.id || !orgId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (await revoked(session)) return NextResponse.json({ error: "Session revoked" }, { status: 401 });
  const items = await db.notification.findMany({ where: { organizationId: orgId }, orderBy: { createdAt: "desc" }, take: 30 });
  const unread = await db.notification.count({ where: { organizationId: orgId, read: false } });
  return NextResponse.json({ ok: true, items, unread });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  const orgId = session?.user?.organizationId;
  if (!session?.user?.id || !orgId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (await revoked(session)) return NextResponse.json({ error: "Session revoked" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  if (body.all) {
    await db.notification.updateMany({ where: { organizationId: orgId, read: false }, data: { read: true } });
    return NextResponse.json({ ok: true });
  }
  if (typeof body.id === "string") {
    // Scoped update prevents cross-workspace marking.
    await db.notification.updateMany({ where: { id: body.id, organizationId: orgId }, data: { read: true } });
    return NextResponse.json({ ok: true });
  }
  return NextResponse.json({ error: "Invalid input" }, { status: 400 });
}
