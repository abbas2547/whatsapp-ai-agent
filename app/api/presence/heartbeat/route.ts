import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { touchPresence, parseDeviceLabel } from "@/lib/presence";
import { isSessionRevoked } from "@/lib/session-guard";
import { db } from "@/lib/db";

/** Authenticated heartbeat: visibility-aware client calls every ~45s. Throttled server-side. */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  // Revoked sessions must not refresh presence (would fake "online").
  if (await isSessionRevoked(session.user.id, session.user.iat)) {
    return NextResponse.json({ error: "Session revoked" }, { status: 401 });
  }
  await touchPresence(session.user.id);
  // Best-effort: keep latest session row fresh (JWT has no server row per token).
  try {
    const ua = req.headers.get("user-agent");
    await db.userSession.updateMany({
      where: { userId: session.user.id, revokedAt: null },
      data: { lastSeenAt: new Date(), userAgent: ua?.slice(0, 500), deviceLabel: parseDeviceLabel(ua).slice(0, 120) },
    });
  } catch { /* noop */ }
  return NextResponse.json({ ok: true });
}
