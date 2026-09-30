import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getAdminContext } from "@/lib/admin";

export async function GET() {
  const ctx = await getAdminContext();
  if (!ctx) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const rows = await db.adminAuditLog.findMany({ orderBy: { createdAt: "desc" }, take: 100 });
  return NextResponse.json({ ok: true, logs: rows });
}
