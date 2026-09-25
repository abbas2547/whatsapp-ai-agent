import { LeadStatus, Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { triggerWorkflows } from "@/services/automation/engine";

export const LEADS_PAGE_SIZE = 24;

export async function listLeads(organizationId: string, status?: LeadStatus, page = 1) {
  return db.lead.findMany({
    where: { organizationId, ...(status ? { status } : {}) },
    select: {
      id: true,
      name: true,
      phone: true,
      company: true,
      service: true,
      source: true,
      status: true,
      score: true,
      budget: true,
      timeline: true,
      intent: true,
      createdAt: true,
      contact: { select: { id: true, name: true } },
      assignedUser: { select: { id: true, name: true, email: true } },
    },
    orderBy: { updatedAt: "desc" },
    take: LEADS_PAGE_SIZE,
    skip: (Math.max(1, page) - 1) * LEADS_PAGE_SIZE,
  });
}

export async function countLeads(organizationId: string, status?: LeadStatus) {
  return db.lead.count({ where: { organizationId, ...(status ? { status } : {}) } });
}

export async function upsertLead(
  organizationId: string,
  input: {
    contactId?: string;
    conversationId?: string;
    service?: string;
    intent?: string;
    budget?: string;
    notes?: string;
    score?: number;
    source?: string;
    name?: string;
    phone?: string;
    email?: string;
    company?: string;
  },
) {
  const existing = input.contactId
    ? await db.lead.findFirst({
        where: { organizationId, contactId: input.contactId, status: { notIn: ["WON", "LOST"] } },
        orderBy: { createdAt: "desc" },
      })
    : null;

  const contact = input.contactId
    ? await db.contact.findFirst({ where: { id: input.contactId, organizationId } })
    : null;
  // Never store a contactId from another workspace: drop it if it isn't ours.
  const contactId = contact?.id;
  const score = typeof input.score === "number" && Number.isFinite(input.score) ? Math.round(input.score) : undefined;

  const data = {
    name: input.name || contact?.name,
    phone: input.phone || contact?.phone,
    email: input.email || contact?.email,
    company: input.company || contact?.company,
    service: input.service,
    intent: input.intent,
    budget: input.budget,
    notes: input.notes,
    score,
    source: input.source,
    conversationId: input.conversationId,
    contactId,
  };

  if (existing) {
    return db.lead.update({
      where: { id: existing.id },
      data: Object.fromEntries(Object.entries(data).filter(([, v]) => v !== undefined)),
    });
  }

  const { source, ...rest } = data;
  const lead = await db.lead.create({
    data: {
      organizationId,
      status: "NEW",
      source: input.source || source || "whatsapp",
      ...rest,
    },
  });
  await triggerWorkflows(organizationId, "lead.created", { leadId: lead.id, contactId });
  return lead;
}

const LEAD_STATUSES = ["NEW", "CONTACTED", "QUALIFIED", "PROPOSAL", "WON", "LOST"] as const;

export async function updateLead(organizationId: string, leadId: string, input: Record<string, unknown>) {
  const lead = await db.lead.findFirst({ where: { id: leadId, organizationId } });
  if (!lead) throw new AppError("Lead not found", "NOT_FOUND", 404);
  const allowed = ["status", "score", "notes", "service", "budget", "intent", "email", "name", "company", "timeline", "assignedUserId"];
  const data: Prisma.LeadUpdateInput = {};
  for (const key of allowed) {
    if (key in input) (data as Record<string, unknown>)[key] = input[key];
  }
  // Validate enum + integer BEFORE Prisma sees them (no cryptic crashes).
  if (data.status !== undefined && !(LEAD_STATUSES as readonly string[]).includes(String(data.status))) {
    throw new AppError("Invalid lead status", "INVALID_STATUS", 400);
  }
  if (typeof data.score === "number") {
    if (!Number.isFinite(data.score)) throw new AppError("Invalid lead score", "INVALID_SCORE", 400);
    (data as Record<string, unknown>).score = Math.round(data.score);
  }
  const updated = await db.lead.update({ where: { id: leadId }, data });
  if (input.status && input.status !== lead.status) {
    await triggerWorkflows(organizationId, "lead.status.changed", {
      leadId,
      from: lead.status,
      to: input.status,
    });
  }
  return updated;
}
