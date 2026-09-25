import { WorkflowExecutionStatus } from "@prisma/client";
import { db, Prisma } from "@/lib/db";
import { sendWhatsAppMessage, resolveAccessToken } from "@/services/whatsapp/client";
import { processAgentTurn } from "@/services/ai/runtime";
import { upsertLead, updateLead } from "@/services/leads/lead.service";
import { addTag, removeTag, updateContact } from "@/services/contacts/contact.service";
import { transferToHuman } from "@/services/inbox/handoff.service";
import { sendGmail } from "@/services/email/gmail";
import { executeHttpRequest } from "@/services/http/http-connector";
import { bookAppointment } from "@/services/calendar/google-calendar";

type Node = { id: string; type: string; data: unknown };
type Edge = { source: string; target: string; sourceHandle?: string | null; label?: string | null };

export async function executeWorkflow(input: {
  workflow: { id: string; nodes: Node[]; edges: Edge[] };
  organizationId: string;
  trigger: string;
  data: Record<string, unknown>;
  resumeExecutionId?: string;
}) {
  const execution =
    input.resumeExecutionId
      ? await db.workflowExecution.update({
          where: { id: input.resumeExecutionId },
          data: { status: "RUNNING", waitUntil: null },
        })
      : await db.workflowExecution.create({
          data: {
            workflowId: input.workflow.id,
            organizationId: input.organizationId,
            trigger: input.trigger,
            status: "RUNNING",
            executionData: input.data as Prisma.InputJsonValue,
            logs: [],
          },
        });

  const nodes = new Map(input.workflow.nodes.map((n) => [n.id, n]));
  const outgoing = input.workflow.edges;
  let current = input.resumeExecutionId
    ? nodes.get(String((execution.executionData as { resumeNode?: string } | null)?.resumeNode || ""))
    : input.workflow.nodes.find((n) => n.type === "TRIGGER");

  const logs: Array<{ nodeId: string; type: string; result?: unknown; error?: string; at: string }> = Array.isArray(
    execution.logs,
  )
    ? (execution.logs as Array<{ nodeId: string; type: string; result?: unknown; error?: string; at: string }>)
    : [];
  const ctx = { ...(input.data || {}) } as Record<string, unknown>;

  try {
    while (current) {
      await db.workflowExecution.update({
        where: { id: execution.id },
        data: { currentNode: current.id },
      });

      if (current.type === "WAIT") {
        const data = (current.data || {}) as { minutes?: number; hours?: number; days?: number; until?: string };
        const untilDate = data.until ? new Date(data.until) : null;
        if (data.until && (!untilDate || isNaN(untilDate.getTime()))) {
          throw new Error("WAIT node has an invalid 'until' date. Use ISO format or minutes/hours/days.");
        }
        const waitUntil =
          untilDate ||
          new Date(
            Date.now() +
              (Number(data.minutes || 0) * 60 + Number(data.hours || 0) * 3600 + Number(data.days || 0) * 86400) *
                1000,
          );
        const next = nextNode(nodes, outgoing, current.id);
        await db.workflowExecution.update({
          where: { id: execution.id },
          data: {
            status: "WAITING",
            waitUntil,
            executionData: { ...ctx, resumeNode: next?.id } as Prisma.InputJsonValue,
            logs: logs as Prisma.InputJsonValue,
          },
        });
        return;
      }

      if (current.type === "END") {
        break;
      }

      const result = await runNode(current, input.organizationId, ctx);
      logs.push({ nodeId: current.id, type: current.type, result, at: new Date().toISOString() });
      if (result && typeof result === "object") Object.assign(ctx, result);

      if (current.type === "CONDITION") {
        const branch = String((result as { branch?: string } | undefined)?.branch || "false");
        current = nextNode(nodes, outgoing, current.id, branch);
      } else {
        current = nextNode(nodes, outgoing, current.id);
      }
    }

    await db.workflowExecution.update({
      where: { id: execution.id },
      data: { status: "COMPLETED", completedAt: new Date(), logs: logs as Prisma.InputJsonValue, executionData: ctx as Prisma.InputJsonValue },
    });
  } catch (error) {
    logs.push({
      nodeId: current?.id || "unknown",
      type: current?.type || "unknown",
      error: error instanceof Error ? error.message : "failed",
      at: new Date().toISOString(),
    });
    await db.workflowExecution.update({
      where: { id: execution.id },
      data: {
        status: "FAILED",
        completedAt: new Date(),
        error: error instanceof Error ? error.message : "failed",
        logs: logs as Prisma.InputJsonValue,
      },
    });
  }
}

function nextNode(nodes: Map<string, Node>, edges: Edge[], source: string, handle?: string): Node | undefined {
  const edge = handle
    ? edges.find((e) => e.source === source && (e.sourceHandle === handle || e.label === handle)) ||
      edges.find((e) => e.source === source)
    : edges.find((e) => e.source === source);
  return edge ? nodes.get(edge.target) : undefined;
}

async function runNode(node: Node, organizationId: string, ctx: Record<string, unknown>) {
  const data = (node.data || {}) as Record<string, unknown>;
  const conversationId = String(ctx.conversationId || data.conversationId || "");
  const contactId = String(ctx.contactId || data.contactId || "");

  switch (node.type) {
    case "TRIGGER":
      return {};
    case "AI": {
      if (!data.agentId) return { skipped: "No agent selected" };
      const conversation = conversationId
        ? await db.conversation.findFirst({ where: { id: conversationId, organizationId } })
        : null;
      const turn = await processAgentTurn({
        organizationId,
        agentId: String(data.agentId),
        conversationId: conversation?.id,
        contactId: conversation?.contactId || contactId || undefined,
        userMessage: String(ctx.message || data.prompt || "Continue the workflow."),
        mode: "production",
      });
      return { reply: turn.reply };
    }
    case "MESSAGE": {
      if (!conversationId) return { skipped: "No conversation" };
      const conversation = await db.conversation.findFirst({
        where: { id: conversationId, organizationId },
        include: { contact: true, phoneNumber: { include: { account: true } } },
      });
      if (!conversation) return { skipped: "Conversation missing" };
      if (data.onlyIfNoReply) {
        const last = await db.message.findFirst({
          where: { conversationId, organizationId },
          orderBy: { createdAt: "desc" },
        });
        if (last?.direction === "INBOUND") return { skipped: "Customer already replied" };
        // Prevent duplicate follow-ups: any system message sent in the window counts,
        // because the sent text is custom per node and can't be matched by content.
        const existingFollowUp = await db.message.findFirst({
          where: {
            conversationId,
            organizationId,
            senderType: "SYSTEM",
            createdAt: { gte: new Date(Date.now() - 20 * 60 * 1000) },
          },
        });
        if (existingFollowUp) return { skipped: "Duplicate follow-up prevented" };
      }
      const token = resolveAccessToken(conversation.phoneNumber.account.accessTokenEncrypted);
      const text = String(data.text || ctx.reply || "");
      if (!text) return { skipped: "Empty message" };
      const waId = await sendWhatsAppMessage({
        phoneNumberId: conversation.phoneNumber.phoneNumberId,
        accessToken: token,
        to: conversation.contact.phone,
        type: data.template ? "template" : "text",
        text,
        template: data.template as Record<string, unknown> | undefined,
      });
      await db.message.create({
        data: {
          organizationId,
          conversationId,
          contactId: conversation.contactId,
          externalMessageId: waId,
          direction: "OUTBOUND",
          senderType: "SYSTEM",
          messageType: data.template ? "TEMPLATE" : "TEXT",
          content: text,
          status: "SENT",
        },
      });
      return { sent: true };
    }
    case "CONDITION": {
      const field = String(data.field || "intent");
      const equals = String(data.equals || "");
      const actual = String(ctx[field] || "").toLowerCase();
      return { branch: actual.includes(equals.toLowerCase()) ? "true" : "false" };
    }
    case "LEAD": {
      if (data.leadId) return updateLead(organizationId, String(data.leadId), data);
      const score = Number(data.score);
      return upsertLead(organizationId, {
        contactId: contactId || undefined,
        conversationId: conversationId || undefined,
        name: data.name as string | undefined,
        phone: data.phone as string | undefined,
        email: data.email as string | undefined,
        company: data.company as string | undefined,
        service: data.service as string | undefined,
        intent: data.intent as string | undefined,
        budget: data.budget as string | undefined,
        notes: data.notes as string | undefined,
        score: Number.isFinite(score) ? score : undefined,
        source: "workflow",
      });
    }
    case "CONTACT": {
      if (!contactId) return { skipped: "No contact" };
      if (data.addTag) await addTag(organizationId, contactId, String(data.addTag));
      if (data.removeTag) await removeTag(organizationId, contactId, String(data.removeTag));
      if (data.fields) await updateContact(organizationId, contactId, data.fields as Record<string, unknown>);
      return { updated: true };
    }
    case "CALENDAR": {
      const startAt = new Date(String(data.startAt || ""));
      const endAt = new Date(String(data.endAt || ""));
      if (!data.startAt || !data.endAt || isNaN(startAt.getTime()) || isNaN(endAt.getTime())) {
        throw new Error("CALENDAR node needs valid startAt and endAt dates. Configure them on the node.");
      }
      if (endAt <= startAt) {
        throw new Error("CALENDAR node endAt must be after startAt.");
      }
      return bookAppointment({
        organizationId,
        contactId: contactId || undefined,
        conversationId: conversationId || undefined,
        title: String(data.title || "Appointment"),
        startAt: startAt.toISOString(),
        endAt: endAt.toISOString(),
      });
    }
    case "EMAIL": {
      return sendGmail(organizationId, {
        to: String(data.to),
        subject: String(data.subject || "Notification"),
        body: String(data.body || ""),
      });
    }
    case "HTTP": {
      return executeHttpRequest(organizationId, String(data.integrationName), (data.parameters as Record<string, unknown>) || ctx);
    }
    case "HUMAN": {
      if (!conversationId) return { skipped: "No conversation" };
      return transferToHuman({
        organizationId,
        conversationId,
        reason: String(data.reason || "Workflow handoff"),
      });
    }
    default:
      return {};
  }
}

export type { WorkflowExecutionStatus };
