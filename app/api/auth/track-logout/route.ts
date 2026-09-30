import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { recordLoginEvent } from "@/lib/presence";
import { getClientIp } from "@/lib/rate-limit";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (session?.user?.id) {
    await recordLoginEvent({
      userId: session.user.id,
      organizationId: session.user.organizationId,
      type: "LOGOUT",
      ip: getClientIp(req),
      userAgent: req.headers.get("user-agent"),
    });
  }
  return NextResponse.json({ ok: true });
}
