import { z } from "zod";
import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { searchKnowledge } from "@/services/knowledge/knowledge.service";
import { upsertLead, updateLead } from "@/services/leads/lead.service";
import { addTag, removeTag, updateContact } from "@/services/contacts/contact.service";
import { transferToHuman } from "@/services/inbox/handoff.service";
import { bookAppointment, checkAvailability } from "@/services/calendar/google-calendar";
import { sendGmail } from "@/services/email/gmail";
import { executeHttpRequest } from "@/services/http/http-connector";
import { writeAuditLog } from "@/services/audit/audit.service";
import type { AgentToolDefinition, ToolContext } from "./types";

function str(obj: Record<string, unknown>, key: string) {
  const value = obj[key];
  return typeof value === "string" ? value : undefined;
}

export const TOOL_DEFINITIONS: AgentToolDefinition[] = [
  {
    name: "search_knowledge",
    description: "Search approved business knowledge. Use this before answering factual questions.",
    schema: z.object({ query: z.string().min(2) }),
    jsonSchema: {
      type: "object",
      properties: { query: { type: "string", description: "Search query" } },
      required: ["query"],
    },
    execute: async (ctx, input) => searchKnowledge(ctx.organizationId, ctx.agentId, String(input.query)),
  },
  {
    name: "get_contact",
    description: "Get the current customer/contact record.",
    schema: z.object({}),
    jsonSchema: { type: "object", properties: {} },
    execute: async (ctx) => {
      if (!ctx.contactId) return { error: "No contact in this conversation" };
      return db.contact.findFirst({
        where: { id: ctx.contactId, organizationId: ctx.organizationId },
        include: { tags: { include: { tag: true } }, leads: { take: 5, orderBy: { createdAt: "desc" } } },
      });
    },
  },
  {
    name: "update_contact",
    description: "Update contact fields such as name, email, company, or notes.",
    schema: z.object({
      name: z.string().optional(),
      email: z.string().optional(),
      company: z.string().optional(),
      notes: z.string().optional(),
    }),
    jsonSchema: {
      type: "object",
      properties: {
        name: { type: "string" },
        email: { type: "string" },
        company: { type: "string" },
        notes: { type: "string" },
      },
    },
    execute: async (ctx, input) => {
      if (!ctx.contactId) throw new AppError("No contact", "NO_CONTACT");
      return updateContact(ctx.organizationId, ctx.contactId, input);
    },
  },
  {
    name: "create_lead",
    description: "Create a sales lead from this conversation.",
    schema: z.object({
      service: z.string().optional(),
      intent: z.string().optional(),
      budget: z.string().optional(),
      notes: z.string().optional(),
      score: z.number().optional(),
    }),
    jsonSchema: {
      type: "object",
      properties: {
        service: { type: "string" },
        intent: { type: "string" },
        budget: { type: "string" },
        notes: { type: "string" },
        score: { type: "number" },
      },
    },
    execute: async (ctx, input) =>
      upsertLead(ctx.organizationId, {
        contactId: ctx.contactId,
        conversationId: ctx.conversationId,
        service: str(input, "service"),
        intent: str(input, "intent"),
        budget: str(input, "budget"),
        notes: str(input, "notes"),
        score: typeof input.score === "number" ? input.score : undefined,
        source: "whatsapp_ai",
      }),
  },
  {
    name: "update_lead",
    description: "Update an existing lead status, score, or details.",
    schema: z.object({
      leadId: z.string(),
      status: z.enum(["NEW", "CONTACTED", "QUALIFIED", "PROPOSAL", "WON", "LOST"]).optional(),
      score: z.number().optional(),
      notes: z.string().optional(),
      service: z.string().optional(),
      budget: z.string().optional(),
      intent: z.string().optional(),
    }),
    jsonSchema: {
      type: "object",
      properties: {
        leadId: { type: "string" },
        status: { type: "string" },
        score: { type: "number" },
        notes: { type: "string" },
        service: { type: "string" },
        budget: { type: "string" },
        intent: { type: "string" },
      },
      required: ["leadId"],
    },
    execute: async (ctx, input) => updateLead(ctx.organizationId, String(input.leadId), input),
  },
  {
    name: "add_tag",
    description: "Add a tag to the current contact.",
    schema: z.object({ tag: z.string() }),
    jsonSchema: {
      type: "object",
      properties: { tag: { type: "string" } },
      required: ["tag"],
    },
    execute: async (ctx, input) => {
      if (!ctx.contactId) throw new AppError("No contact", "NO_CONTACT");
      return addTag(ctx.organizationId, ctx.contactId, String(input.tag));
    },
  },
  {
    name: "remove_tag",
    description: "Remove a tag from the current contact.",
    schema: z.object({ tag: z.string() }),
    jsonSchema: {
      type: "object",
      properties: { tag: { type: "string" } },
      required: ["tag"],
    },
    execute: async (ctx, input) => {
      if (!ctx.contactId) throw new AppError("No contact", "NO_CONTACT");
      return removeTag(ctx.organizationId, ctx.contactId, String(input.tag));
    },
  },
  {
    name: "transfer_to_human",
    description: "Transfer the conversation to a human teammate. Use when the customer asks for a person or the issue is outside approved knowledge.",
    schema: z.object({ reason: z.string() }),
    jsonSchema: {
      type: "object",
      properties: { reason: { type: "string" } },
      required: ["reason"],
    },
    execute: async (ctx, input) => {
      if (!ctx.conversationId) throw new AppError("No conversation", "NO_CONVERSATION");
      return transferToHuman({
        organizationId: ctx.organizationId,
        conversationId: ctx.conversationId,
        reason: String(input.reason),
        actorUserId: ctx.userId,
      });
    },
  },
  {
    name: "check_calendar_availability",
    description: "Check Google Calendar availability for appointment booking.",
    schema: z.object({
      date: z.string(),
      durationMinutes: z.number().optional(),
    }),
    jsonSchema: {
      type: "object",
      properties: {
        date: { type: "string", description: "ISO date" },
        durationMinutes: { type: "number" },
      },
      required: ["date"],
    },
    execute: async (ctx, input) =>
      checkAvailability(ctx.organizationId, String(input.date), Number(input.durationMinutes || 30)),
  },
  {
    name: "book_appointment",
    description: "Book an appointment after the customer confirms a time.",
    schema: z.object({
      title: z.string(),
      startAt: z.string(),
      endAt: z.string(),
      confirmed: z.boolean(),
    }),
    jsonSchema: {
      type: "object",
      properties: {
        title: { type: "string" },
        startAt: { type: "string" },
        endAt: { type: "string" },
        confirmed: { type: "boolean" },
      },
      required: ["title", "startAt", "endAt", "confirmed"],
    },
    execute: async (ctx, input) => {
      if (!input.confirmed) return { error: "Customer confirmation is required before booking." };
      return bookAppointment({
        organizationId: ctx.organizationId,
        contactId: ctx.contactId,
        conversationId: ctx.conversationId,
        title: String(input.title),
        startAt: String(input.startAt),
        endAt: String(input.endAt),
      });
    },
  },
  {
    name: "send_email",
    description: "Send an internal Gmail notification. Not for customer WhatsApp replies.",
    schema: z.object({
      to: z.string(),
      subject: z.string(),
      body: z.string(),
    }),
    jsonSchema: {
      type: "object",
      properties: {
        to: { type: "string" },
        subject: { type: "string" },
        body: { type: "string" },
      },
      required: ["to", "subject", "body"],
    },
    execute: async (ctx, input) =>
      sendGmail(ctx.organizationId, {
        to: String(input.to),
        subject: String(input.subject),
        body: String(input.body),
      }),
  },
  {
    name: "http_request",
    description: "Call a preconfigured HTTP integration. Arbitrary URLs are not allowed.",
    schema: z.object({
      integrationName: z.string(),
      parameters: z.record(z.string(), z.unknown()).optional(),
    }),
    jsonSchema: {
      type: "object",
      properties: {
        integrationName: { type: "string" },
        parameters: { type: "object" },
      },
      required: ["integrationName"],
    },
    execute: async (ctx, input) =>
      executeHttpRequest(ctx.organizationId, String(input.integrationName), (input.parameters as Record<string, unknown>) || {}),
  },
];

export const TOOL_NAMES = TOOL_DEFINITIONS.map((t) => t.name);

export function toAIToolSpec(def: typeof TOOL_DEFINITIONS[0]) {
  return {
    name: def.name,
    description: def.description,
    parameters: def.jsonSchema,
  };
}

export async function executeAuthorizedTool(
  ctx: ToolContext,
  name: string,
  rawInput: Record<string, unknown>,
) {
  const enabled = await db.agentTool.findFirst({
    where: { organizationId: ctx.organizationId, agentId: ctx.agentId, toolName: name, enabled: true },
  });
  if (!enabled) {
    throw new AppError(`Tool ${name} is not enabled for this agent`, "TOOL_DISABLED", 403);
  }
  const tool = TOOL_DEFINITIONS.find((t) => t.name === name);
  if (!tool) throw new AppError(`Unknown tool ${name}`, "UNKNOWN_TOOL", 400);
  try {
    // Parse INSIDE the try: invalid LLM arguments must fail this tool call,
    // not abort the whole agent turn (and must still write the failure audit log).
    const parsed = tool.schema.parse(rawInput);
    const result = await tool.execute(ctx, parsed as Record<string, unknown>);
    await writeAuditLog({
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      action: `tool.${name}`,
      entityType: "agent",
      entityId: ctx.agentId,
      metadata: { conversationId: ctx.conversationId, ok: true },
    });
    return { ok: true, result };
  } catch (error) {
    await writeAuditLog({
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      action: `tool.${name}.failed`,
      entityType: "agent",
      entityId: ctx.agentId,
      metadata: { reason: error instanceof Error ? error.message : "unknown" },
    });
    return { ok: false, error: error instanceof Error ? error.message : "Tool failed" };
  }
}
