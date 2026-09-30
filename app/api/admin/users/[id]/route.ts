import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getAdminContext, logAdminAction } from "@/lib/admin";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getAdminContext();
  if (!ctx) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  // IDOR-safe: requireAdmin() already gates the whole route; we only read by id.
  const user = await db.user.findUnique({
    where: { id },
    select: {
      id: true, name: true, email: true, image: true, createdAt: true, lastLoginAt: true, lastLogoutAt: true, lastSeenAt: true,
      memberships: { select: { role: true, organization: { select: { id: true, name: true } } } },
    },
  });
  if (!user) return NextResponse.json({ error: "Not found" }, { status: 404 });
  await logAdminAction({ actorId: ctx.userId, actorEmail: ctx.email, action: "USER_VIEWED", resource: "user", resourceId: id, ip: "api" });
  return NextResponse.json({ ok: true, user });
}
