import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getClientIp, rateLimit } from "@/lib/rate-limit";
import { timingSafeCompare } from "@/lib/encryption";
import { triggerWorkflows } from "@/services/automation/engine";

export async function POST(request: NextRequest) {
  const limited = rateLimit(`hook:${getClientIp(request)}`, 60, 60_000);
  if (!limited.success) return NextResponse.json({ error: "Rate limited" }, { status: 429 });
  const token = request.nextUrl.searchParams.get("token");
  if (!token) return NextResponse.json({ error: "Missing token" }, { status: 401 });
  // Compare in constant time against stored tokens (never leak via timing or
  // distinct 404 vs 401 — both are "unknown" to the caller).
  const candidates = await db.integration.findMany({
    where: { provider: "WEBHOOK", enabled: true },
    select: { id: true, organizationId: true, config: true },
    take: 100,
  });
  let matched: { id: string; organizationId: string } | null = null;
  for (const c of candidates) {
    const stored =
      c.config && typeof c.config === "object"
        ? String((c.config as Record<string, unknown>).token || "")
        : "";
    if (stored && timingSafeCompare(stored, token)) {
      matched = c;
      break;
    }
  }
  if (!matched) return NextResponse.json({ error: "Unknown webhook" }, { status: 404 });
  let payload: unknown = {};
  try {
    const text = await request.text();
    payload = text ? (JSON.parse(text) as unknown) : {};
    if (payload !== null && typeof payload !== "object") payload = { value: payload };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  await triggerWorkflows(matched.organizationId, "webhook.received", { payload: payload as Record<string, unknown> });
  return NextResponse.json({ ok: true });
}
