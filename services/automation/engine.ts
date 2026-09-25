import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { executeWorkflow } from "@/services/automation/executor";

export async function triggerWorkflows(
  organizationId: string,
  trigger: string,
  data: Record<string, unknown>,
) {
  const workflows = await db.workflow.findMany({
    where: { organizationId, enabled: true, publishState: "PUBLISHED" },
    include: { nodes: true, edges: true },
  });

  for (const workflow of workflows) {
    const triggerNode = workflow.nodes.find((n: { type: string }) => n.type === "TRIGGER");
    const triggerType = (triggerNode?.data as { trigger?: string } | null)?.trigger;
    if (triggerType && triggerType !== trigger) continue;
    if (!triggerNode && trigger !== "manual") continue;
    await executeWorkflow({
      workflow,
      organizationId,
      trigger,
      data,
    });
  }
}

export async function saveWorkflowGraph(
  organizationId: string,
  workflowId: string,
  graph: { nodes: Prisma.WorkflowNodeCreateManyInput[]; edges: Prisma.WorkflowEdgeCreateManyInput[] },
) {
  const owned = await db.workflow.findFirst({
    where: { id: workflowId, organizationId },
    select: { id: true },
  });
  if (!owned) throw new AppError("Workflow not found", "NOT_FOUND", 404);
  // Delete + recreate atomically so a failed save never loses the graph.
  await db.$transaction(async (tx) => {
    await tx.workflowNode.deleteMany({ where: { workflowId } });
    await tx.workflowEdge.deleteMany({ where: { workflowId } });
    if (graph.nodes.length) {
      await tx.workflowNode.createMany({
        data: graph.nodes.map((n) => ({ ...n, workflowId })),
      });
    }
    if (graph.edges.length) {
      await tx.workflowEdge.createMany({
        data: graph.edges.map((e) => ({ ...e, workflowId })),
      });
    }
  });
  return db.workflow.findFirst({
    where: { id: workflowId, organizationId },
    include: { nodes: true, edges: true },
  });
}

export async function processDueExecutions() {
  const due = await db.workflowExecution.findMany({
    where: { status: "WAITING", waitUntil: { lte: new Date() } },
    take: 20,
  });
  for (const execution of due) {
    const workflow = await db.workflow.findUnique({
      where: { id: execution.workflowId },
      include: { nodes: true, edges: true },
    });
    if (!workflow) continue;
    await executeWorkflow({
      workflow,
      organizationId: execution.organizationId,
      trigger: execution.trigger,
      data: (execution.executionData as Record<string, unknown>) || {},
      resumeExecutionId: execution.id,
    });
  }

  const approaching = await db.appointment.findMany({
    where: {
      status: "CONFIRMED",
      startAt: { gte: new Date(), lte: new Date(Date.now() + 60 * 60 * 1000) },
    },
    take: 20,
  });
  for (const appt of approaching) {
    // Fire once per appointment: skip if we already triggered a reminder run recently.
    const already = await db.workflowExecution.findFirst({
      where: {
        organizationId: appt.organizationId,
        trigger: "appointment.approaching",
        executionData: { path: ["appointmentId"], equals: appt.id },
        startedAt: { gte: new Date(Date.now() - 2 * 60 * 60 * 1000) },
      },
      select: { id: true },
    });
    if (already) continue;
    await triggerWorkflows(appt.organizationId, "appointment.approaching", { appointmentId: appt.id });
  }
}
