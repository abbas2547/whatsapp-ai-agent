import { NextResponse } from "next/server";
import { getAdminContext } from "@/lib/admin";
import { getAdminOverview } from "@/lib/admin-queries";

export async function GET() {
  const ctx = await getAdminContext();
  if (!ctx) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  try {
    const data = await getAdminOverview();
    return NextResponse.json({ ok: true, data });
  } catch (e) {
    console.error("[admin/overview]", e instanceof Error ? e.message : "unknown");
    return NextResponse.json({ error: "Failed to load overview" }, { status: 500 });
  }
}
