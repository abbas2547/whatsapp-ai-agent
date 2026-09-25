import { NextRequest, NextResponse } from "next/server";
import { env } from "@/lib/env";
import { processDueExecutions } from "@/services/automation/engine";

export async function POST(request: NextRequest) {
  // Fail closed: without a configured CRON_SECRET nobody may trigger the cron.
  const expected = env().CRON_SECRET;
  const secret = request.headers.get("x-cron-secret");
  if (!expected || secret !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  await processDueExecutions();
  return NextResponse.json({ ok: true });
}
