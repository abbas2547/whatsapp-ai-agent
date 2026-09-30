import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getAdminContext, logAdminAction } from "@/lib/admin";
import { getClientIp } from "@/lib/rate-limit";

export async function POST(req: NextRequest, { params }: { params: Promise<{ execId: string }> }) {
  const ctx = await getAdminContext();
  if (!ctx) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { execId } = await params;
  const exec = await db.workflowExecution.findUnique({ where: { id: execId } });
  if (!exec) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (exec.status !== "FAILED") return NextResponse.json({ error: "Only failed executions can be retried" }, { status: 400 });
  const retry = await db.workflowExecution.create({
    data: { workflowId: exec.workflowId, organizationId: exec.organizationId, trigger: exec.trigger, status: "RUNNING", executionData: (exec.executionData as never) ?? undefined },
  });
  await logAdminAction({ actorId: ctx.userId, actorEmail: ctx.email, action: "AUTOMATION_RETRIED", resource: "execution", resourceId: execId, workspaceId: exec.organizationId, ip: getClientIp(req), metadata: { retryId: retry.id } });
  return NextResponse.json({ ok: true, retryId: retry.id });
}
