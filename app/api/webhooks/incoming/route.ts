import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { rateLimit } from "@/lib/rate-limit";
import { triggerWorkflows } from "@/services/automation/engine";

export async function POST(request: NextRequest) {
  const limited = rateLimit(`hook:${request.headers.get("x-forwarded-for") || "local"}`, 60, 60_000);
  if (!limited.success) return NextResponse.json({ error: "Rate limited" }, { status: 429 });
  const token = request.nextUrl.searchParams.get("token");
  if (!token) return NextResponse.json({ error: "Missing token" }, { status: 401 });
  const integration = await db.integration.findFirst({
    where: { provider: "WEBHOOK", enabled: true, config: { path: ["token"], equals: token } },
  });
  if (!integration) return NextResponse.json({ error: "Unknown webhook" }, { status: 404 });
  const payload = await request.json().catch(() => ({}));
  await triggerWorkflows(integration.organizationId, "webhook.received", { payload });
  return NextResponse.json({ ok: true });
}
