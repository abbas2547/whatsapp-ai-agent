import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getAdminContext } from "@/lib/admin";

export async function GET() {
  const ctx = await getAdminContext();
  if (!ctx) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const rows = await db.userSession.findMany({ orderBy: { lastSeenAt: "desc" }, take: 100, include: { user: { select: { name: true, email: true } } } });
  return NextResponse.json({ ok: true, sessions: rows });
}
