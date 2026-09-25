import { db } from "@/lib/db";
import type { WorkflowExecutionStatus } from "@prisma/client";

export type ExecutionLogEntry = {
  nodeId: string;
  type: string;
  result?: unknown;
  error?: string;
  at: string;
};

export async function listWorkflowExecutions(organizationId: string, workflowId: string, take = 20) {
  return db.workflowExecution.findMany({
    where: { organizationId, workflowId },
    select: {
      id: true,
      trigger: true,
      status: true,
      startedAt: true,
      completedAt: true,
      error: true,
      logs: true,
    },
    orderBy: { startedAt: "desc" },
    take,
  });
}

export function formatDuration(startedAt: Date, completedAt: Date | null) {
  if (!completedAt) return "—";
  const ms = completedAt.getTime() - startedAt.getTime();
  if (ms < 1000) return `${ms} ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)} s`;
  return `${(ms / 60000).toFixed(1)} min`;
}

export function parseLogs(logs: unknown): ExecutionLogEntry[] {
  if (!Array.isArray(logs)) return [];
  return logs.filter(
    (l): l is ExecutionLogEntry =>
      !!l && typeof l === "object" && typeof (l as { type?: unknown }).type === "string",
  );
}

export type { WorkflowExecutionStatus };
