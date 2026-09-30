import { NextResponse } from "next/server";
import { getAdminContext } from "@/lib/admin";
import { getSystemHealth } from "@/lib/health";
import { db } from "@/lib/db";

export async function GET() {
  const ctx = await getAdminContext();
  if (!ctx) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  try {
    const items = await getSystemHealth();
    // Persist snapshot (best-effort) for the system page timeline.
    void Promise.all(
      items.map((i) =>
        db.systemHealthCheck.create({ data: { service: i.service, status: i.status, latencyMs: i.latencyMs, message: i.message.slice(0, 300) } }).catch(() => null),
      ),
    );
    return NextResponse.json({ ok: true, items });
  } catch (e) {
    console.error("[admin/health]", e instanceof Error ? e.message : "unknown");
    return NextResponse.json({ error: "Health check failed" }, { status: 500 });
  }
}
