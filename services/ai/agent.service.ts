import { z } from "zod";
import { AgentGoal, AgentStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { AppError, LimitError } from "@/lib/errors";
import { canCreateAgent } from "@/services/billing/entitlements";
import { TOOL_NAMES } from "@/services/ai/tools/registry";
import { writeAuditLog } from "@/services/audit/audit.service";

export const agentInputSchema = z.object({
  name: z.string().min(2),
  avatar: z.string().optional(),
  description: z.string().optional(),
  businessDescription: z.string().optional(),
  personality: z.string().optional(),
  tone: z.string().optional(),
  language: z.string().optional(),
  goal: z.nativeEnum(AgentGoal).optional(),
  systemInstructions: z.string().optional(),
  rules: z.string().optional(),
  prohibitedActions: z.string().optional(),
  escalationRules: z.string().optional(),
  businessHours: z.any().optional(),
  fallbackResponse: z.string().optional(),
  status: z.nativeEnum(AgentStatus).optional(),
  whatsappPhoneNumberId: z.string().optional().nullable(),
  enabledTools: z.array(z.string()).optional(),
  knowledgeBaseIds: z.array(z.string()).optional(),
});

export async function listAgents(organizationId: string) {
  return db.agent.findMany({
    where: { organizationId },
    select: {
      id: true,
      name: true,
      avatar: true,
      description: true,
      goal: true,
      status: true,
      language: true,
      updatedAt: true,
      tools: { select: { toolName: true, enabled: true } },
      knowledgeLinks: { select: { knowledgeBaseId: true } },
      whatsappPhoneNumber: { select: { id: true, displayPhoneNumber: true } },
      _count: { select: { conversations: true } },
    },
    orderBy: { updatedAt: "desc" },
  });
}

export async function getAgent(organizationId: string, id: string) {
  const agent = await db.agent.findFirst({
    where: { id, organizationId },
    include: { tools: true, knowledgeLinks: true, whatsappPhoneNumber: true },
  });
  if (!agent) throw new AppError("Agent not found", "NOT_FOUND", 404);
  return agent;
}

export async function createAgent(organizationId: string, userId: string, input: z.infer<typeof agentInputSchema>) {
  const parsed = agentInputSchema.parse(input);
  const allowed = await canCreateAgent(organizationId);
  if (!allowed.ok) {
    throw new LimitError(
      `${allowed.message} Upgrade to ${allowed.upgradePlan === "starter" ? "Starter" : allowed.upgradePlan === "pro" ? "Pro" : "Business"} to create more.`,
      "LIMIT_REACHED_AGENTS",
      allowed.upgradePlan,
    );
  }
  const phoneId = parsed.whatsappPhoneNumberId || undefined;
  if (phoneId) {
    const phone = await db.whatsAppPhoneNumber.findFirst({
      where: { id: phoneId, organizationId },
    });
    if (!phone) throw new AppError("WhatsApp number not found", "NOT_FOUND", 404);
  }
  const agent = await db.agent.create({
    data: {
      organizationId,
      name: parsed.name,
      avatar: parsed.avatar,
      description: parsed.description,
      businessDescription: parsed.businessDescription,
      personality: parsed.personality,
      tone: parsed.tone,
      language: parsed.language || "en",
      goal: parsed.goal || "GENERAL_ASSISTANT",
      systemInstructions: parsed.systemInstructions,
      rules: parsed.rules,
      prohibitedActions: parsed.prohibitedActions,
      escalationRules: parsed.escalationRules,
      businessHours: parsed.businessHours,
      fallbackResponse:
        parsed.fallbackResponse ||
        "I do not have that information yet. I can connect you with a teammate if you would like.",
      status: parsed.status || "DRAFT",
      whatsappPhoneNumberId: phoneId,
    },
  });
  await syncAgentExtras(agent.id, organizationId, parsed);
  await writeAuditLog({
    organizationId,
    userId,
    action: "agent.created",
    entityType: "agent",
    entityId: agent.id,
  });
  return getAgent(organizationId, agent.id);
}

export async function updateAgent(
  organizationId: string,
  userId: string,
  id: string,
  input: Partial<z.infer<typeof agentInputSchema>>,
) {
  await getAgent(organizationId, id);
  const parsed = agentInputSchema.partial().parse(input);
  const { enabledTools, knowledgeBaseIds, whatsappPhoneNumberId, ...data } = parsed;
  // enabledTools/knowledgeBaseIds are handled by syncAgentExtras below.
  void enabledTools;
  void knowledgeBaseIds;
  const phoneId =
    whatsappPhoneNumberId === undefined ? undefined : whatsappPhoneNumberId || null;
  if (phoneId) {
    const phone = await db.whatsAppPhoneNumber.findFirst({
      where: { id: phoneId, organizationId },
    });
    if (!phone) throw new AppError("WhatsApp number not found", "NOT_FOUND", 404);
  }
  const updated = await db.agent.updateMany({
    where: { id, organizationId },
    data: {
      ...data,
      whatsappPhoneNumberId: phoneId,
    },
  });
  if (!updated.count) throw new AppError("Agent not found", "NOT_FOUND", 404);
  await syncAgentExtras(id, organizationId, parsed);
  await writeAuditLog({
    organizationId,
    userId,
    action: "agent.updated",
    entityType: "agent",
    entityId: id,
  });
  return getAgent(organizationId, id);
}

async function syncAgentExtras(
  agentId: string,
  organizationId: string,
  parsed: Partial<z.infer<typeof agentInputSchema>>,
) {
  if (parsed.enabledTools) {
    const allowed = parsed.enabledTools.filter((name) => TOOL_NAMES.includes(name));
    await db.agentTool.deleteMany({ where: { agentId, organizationId } });
    if (allowed.length) {
      await db.agentTool.createMany({
        data: allowed.map((toolName) => ({
          organizationId,
          agentId,
          toolName,
          enabled: true,
        })),
      });
    }
  }
  if (parsed.knowledgeBaseIds) {
    // Only link knowledge bases owned by this organization.
    const owned = await db.knowledgeBase.findMany({
      where: { id: { in: parsed.knowledgeBaseIds }, organizationId },
      select: { id: true },
    });
    const ownedIds = new Set(owned.map((k) => k.id));
    await db.agentKnowledgeBase.deleteMany({ where: { agentId } });
    const allowed = parsed.knowledgeBaseIds.filter((kbId) => ownedIds.has(kbId));
    if (allowed.length) {
      await db.agentKnowledgeBase.createMany({
        data: allowed.map((knowledgeBaseId) => ({ agentId, knowledgeBaseId })),
      });
    }
  }
}

export async function publishAgent(organizationId: string, userId: string, id: string) {
  const agent = await getAgent(organizationId, id);
  if (!agent.businessDescription && !agent.systemInstructions) {
    throw new AppError("Add business information before publishing.", "AGENT_INCOMPLETE");
  }
  const updated = await db.agent.updateMany({
    where: { id, organizationId },
    data: { status: "ACTIVE" },
  });
  if (!updated.count) throw new AppError("Agent not found", "NOT_FOUND", 404);
  await writeAuditLog({
    organizationId,
    userId,
    action: "agent.published",
    entityType: "agent",
    entityId: id,
  });
  return getAgent(organizationId, id);
}

export function buildAgentSystemPrompt(agent: {
  name: string;
  businessDescription?: string | null;
  personality?: string | null;
  tone?: string | null;
  language?: string | null;
  goal?: string | null;
  systemInstructions?: string | null;
  rules?: string | null;
  prohibitedActions?: string | null;
  escalationRules?: string | null;
  fallbackResponse?: string | null;
  businessHours?: unknown;
}) {
  return [
    `You are ${agent.name}, an AI employee for WhatsApp.`,
    "Never invent business facts, prices, policies, availability, or promises.",
    "If information is missing from knowledge or tool results, say you do not have it and offer human help.",
    "Collect missing lead qualification details naturally, one or two questions at a time.",
    "WhatsApp is the only customer channel. Keep replies concise and conversational.",
    agent.businessDescription ? `Business: ${agent.businessDescription}` : "",
    agent.personality ? `Personality: ${agent.personality}` : "",
    agent.tone ? `Tone: ${agent.tone}` : "",
    agent.language ? `Language: ${agent.language}` : "",
    agent.goal ? `Goal: ${agent.goal}` : "",
    agent.systemInstructions ? `Instructions: ${agent.systemInstructions}` : "",
    agent.rules ? `Rules: ${agent.rules}` : "",
    agent.prohibitedActions ? `Do not: ${agent.prohibitedActions}` : "",
    agent.escalationRules ? `Escalation: ${agent.escalationRules}` : "",
    agent.businessHours ? `Business hours: ${JSON.stringify(agent.businessHours)}` : "",
    agent.fallbackResponse ? `Fallback: ${agent.fallbackResponse}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}
