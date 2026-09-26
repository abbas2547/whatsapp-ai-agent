"use server";

import { z } from "zod";
import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { assertCanManageAgents, requireOrgContext } from "@/lib/tenant";
import { saveWorkflowGraph } from "@/services/automation/engine";
import { fail } from "./_shared";

export async function saveWorkflowAction(workflowId: string | undefined, payload: { name: string; enabled?: boolean; publishState?: "DRAFT" | "PUBLISHED"; nodes: unknown[]; edges: unknown[] }) {
  try {
    const ctx = await requireOrgContext();
    assertCanManageAgents(ctx);
    // Strict validation: unvalidated graphs allow stored XSS / DoS / mail spam.
    const nodeSchema = z.object({
      id: z.string().max(64),
      type: z.enum(["TRIGGER", "AI", "MESSAGE", "CONDITION", "LEAD", "CONTACT", "CALENDAR", "EMAIL", "HTTP", "HUMAN", "WAIT", "END"]),
      data: z.record(z.string(), z.unknown()).optional(),
      positionX: z.number().optional(),
      positionY: z.number().optional(),
    });
    const edgeSchema = z.object({
      source: z.string().max(64),
      target: z.string().max(64),
      sourceHandle: z.string().max(32).optional().nullable(),
      targetHandle: z.string().max(32).optional().nullable(),
      label: z.string().max(64).optional().nullable(),
    });
    const parsed = z.object({
      name: z.string().trim().min(1).max(100),
      enabled: z.boolean().optional(),
      publishState: z.enum(["DRAFT", "PUBLISHED"]).optional(),
      nodes: z.array(nodeSchema).max(50),
      edges: z.array(edgeSchema).max(100),
    }).parse(payload);
    for (const n of parsed.nodes) {
      const data = (n.data || {}) as Record<string, unknown>;
      for (const [k, v] of Object.entries(data)) {
        if (typeof v === "string" && v.length > 4000) {
          throw new AppError(`Workflow node "${n.type}" field "${k}" is too long (max 4000 chars).`, "INVALID_INPUT", 400);
        }
      }
      if (n.type === "WAIT") {
        const minutes = Number((data.minutes as number) || 0);
        const hours = Number((data.hours as number) || 0);
        const days = Number((data.days as number) || 0);
        const until = data.until ? new Date(String(data.until)) : null;
        if (data.until && (!until || isNaN(until.getTime()))) throw new AppError("WAIT node has an invalid date.", "INVALID_INPUT", 400);
        if (until && (until.getTime() - Date.now() > 90 * 24 * 3600_000 || until.getTime() < Date.now() - 3600_000)) {
          throw new AppError("WAIT 'until' must be within the next 90 days.", "INVALID_INPUT", 400);
        }
        if (!data.until && (minutes + hours * 60 + days * 1440 > 90 * 1440 || minutes + hours * 60 + days * 1440 <= 0)) {
          throw new AppError("WAIT duration must be between 1 minute and 90 days.", "INVALID_INPUT", 400);
        }
      }
      if (n.type === "EMAIL") {
        const to = String(data.to || "");
        if (to && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(to)) {
          throw new AppError("EMAIL node needs a valid recipient address.", "INVALID_INPUT", 400);
        }
      }
      if (n.type === "HTTP" && data.url && typeof data.url === "string") {
        if (!data.url.startsWith("https://") || data.url.length > 2048) {
          throw new AppError("HTTP node URL must be a valid https URL.", "INVALID_INPUT", 400);
        }
      }
    }
    let resolvedId = workflowId;
    if (resolvedId) {
      // Verify ownership BEFORE touching the row (never update-then-check).
      const owned = await db.workflow.findFirst({
        where: { id: resolvedId, organizationId: ctx.organizationId },
        select: { id: true },
      });
      if (!owned) throw new AppError("Workflow not found", "NOT_FOUND", 404);
      await db.workflow.update({
        where: { id: resolvedId },
        data: { name: parsed.name, enabled: parsed.enabled, publishState: parsed.publishState },
      });
    } else {
      const created = await db.workflow.create({
        data: { organizationId: ctx.organizationId, name: parsed.name, enabled: false },
      });
      resolvedId = created.id;
    }
    await saveWorkflowGraph(ctx.organizationId, resolvedId, {
      nodes: parsed.nodes as never,
      edges: parsed.edges as never,
    });
    return { ok: true as const, id: resolvedId };
  } catch (error) {
    return fail(error);
  }
}
