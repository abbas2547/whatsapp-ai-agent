import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { recordUsage, writeAuditLog } from "@/services/audit/audit.service";
import { aiConversationAllowance } from "@/services/billing/entitlements";
import { buildAgentSystemPrompt } from "@/services/ai/agent.service";
import { getAIProvider, type AIMessage } from "@/services/ai/provider";
import { executeAuthorizedTool, TOOL_DEFINITIONS, toAIToolSpec } from "@/services/ai/tools/registry";
import { searchKnowledge } from "@/services/knowledge/knowledge.service";

export type AgentTurnResult = {
  reply: string;
  toolCalls: Array<{ name: string; arguments: Record<string, unknown>; result: unknown }>;
  knowledgeUsed: Array<{ content: string; score: number }>;
  responseTimeMs: number;
  error?: string;
};

export async function processAgentTurn(input: {
  organizationId: string;
  agentId: string;
  conversationId?: string;
  contactId?: string;
  userMessage: string;
  mode: "production" | "test";
  history?: Array<{ role: "user" | "assistant"; content: string }>;
}): Promise<AgentTurnResult> {
  const started = Date.now();
  const toolCalls: AgentTurnResult["toolCalls"] = [];
  let knowledgeUsed: AgentTurnResult["knowledgeUsed"] = [];

  try {
    const agent = await db.agent.findFirst({
      where: { id: input.agentId, organizationId: input.organizationId },
      include: { tools: true },
    });
    if (!agent) throw new AppError("Agent not found", "NOT_FOUND", 404);
    if (input.mode === "production" && agent.status !== "ACTIVE") {
      throw new AppError("Agent is not active", "AGENT_INACTIVE");
    }

    // Plan enforcement (production only): when the monthly AI quota is
    // exhausted, stop silently — no reply is sent (the webhook skips empty
    // replies and records no usage), and the workspace is notified to
    // upgrade. Test chats are never blocked.
    if (input.mode === "production") {
      const allowance = await aiConversationAllowance(input.organizationId);
      if (!allowance.allowed) {
        await db.auditLog
          .create({
            data: {
              organizationId: input.organizationId,
              action: "AI_LIMIT_REACHED",
              entityType: "agent",
              entityId: agent.id,
              metadata: { used: allowance.used, limit: allowance.limit, plan: allowance.planId },
            },
          })
          .catch(() => undefined);
        const recent = await db.notification.findFirst({
          where: {
            organizationId: input.organizationId,
            type: "SYSTEM",
            read: false,
            title: "AI conversation limit reached",
            createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
          },
          select: { id: true },
        });
        if (!recent) {
          await db.notification
            .create({
              data: {
                organizationId: input.organizationId,
                type: "SYSTEM",
                title: "AI conversation limit reached",
                body: `Used ${allowance.used.toLocaleString("en-IN")} of ${allowance.limit.toLocaleString("en-IN")} AI conversations this period. Upgrade the plan to keep the AI replying.`,
              },
            })
            .catch(() => undefined);
        }
        return { reply: "", toolCalls, knowledgeUsed, responseTimeMs: Date.now() - started, error: "AI_LIMIT_REACHED" };
      }
    }

    const contact = input.contactId
      ? await db.contact.findFirst({
          where: { id: input.contactId, organizationId: input.organizationId },
          include: { leads: { take: 1, orderBy: { createdAt: "desc" } } },
        })
      : null;
    const qualification = await db.qualificationField.findMany({
      where: { organizationId: input.organizationId },
      orderBy: { sortOrder: "asc" },
    });

    knowledgeUsed = await searchKnowledge(input.organizationId, agent.id, input.userMessage);

    const enabledTools = agent.tools.filter((t: { enabled: boolean }) => t.enabled);
    const toolSpecs = TOOL_DEFINITIONS.filter((t: { name: string }) => enabledTools.some((e: { toolName: string }) => e.toolName === t.name)).map(toAIToolSpec);

    const historyMessages: AIMessage[] =
      input.history?.map((m) => ({ role: m.role, content: m.content })) ||
      (input.conversationId
        ? (
            await db.message.findMany({
              where: { conversationId: input.conversationId, organizationId: input.organizationId },
              orderBy: { createdAt: "desc" },
              take: 16,
            })
          )
            .reverse()
            .map((m: { senderType: string; content: string | null }) => ({
              role: m.senderType === "CUSTOMER" ? "user" : "assistant",
              content: m.content || "",
            }))
        : []);

    const messages: AIMessage[] = [
      { role: "system", content: buildAgentSystemPrompt(agent) },
      {
        role: "system",
        content: `<customer_record>${JSON.stringify({
          name: contact?.name,
          phone: contact?.phone,
          email: contact?.email,
          company: contact?.company,
          notes: contact?.notes,
          lead: contact?.leads?.[0],
        })}</customer_record>\nUse the name naturally (once per conversation, not every reply). Never reveal phone/email back unless asked.`,
      },
      {
        role: "system",
        content: `<qualification_fields>${qualification.map((q: { label: string }) => q.label).join(", ") || "name, service, budget, timeline, email"}</qualification_fields>`,
      },
      {
        role: "system",
        content: knowledgeUsed.length
          ? `<approved_knowledge>\n${knowledgeUsed.map((k, i) => `${i + 1}. ${k.content}`).join("\n")}\n</approved_knowledge>\nAnswer ONLY from these excerpts + tool results. If they don't cover the question, say so and offer human help.`
          : "<approved_knowledge>none retrieved</approved_knowledge>\nNo knowledge excerpts were retrieved. Do not invent facts — offer human help or ask a clarifying question.",
      },
      ...historyMessages.filter((m) => m.content).slice(-16),
      { role: "user", content: input.userMessage },
    ];

    const provider = getAIProvider();
    let result = await provider.generate({ messages, tools: toolSpecs });
    await recordUsage(input.organizationId, "ai.tokens", (result.usage?.inputTokens || 0) + (result.usage?.outputTokens || 0));

    let loops = 0;
    let lastSignature = "";
    while (result.toolCalls.length && loops < 4) {
      loops += 1;
      // The model is stuck repeating the same call — stop looping and force a
      // text reply below instead of burning 4 slow round-trips.
      const signature = JSON.stringify(result.toolCalls.map((c) => [c.name, c.arguments]));
      if (signature === lastSignature) break;
      lastSignature = signature;
      // Keep the OpenAI-style handshake intact for OpenRouter: the assistant
      // turn that requested the tools must precede the tool results.
      // (Gemini provider ignores toolCalls/id fields, so this is backward compatible.)
      messages.push({
        role: "assistant",
        content: result.text || "",
        toolCalls: result.toolCalls.map((c) => ({ id: c.id, name: c.name, arguments: c.arguments })),
      });
      for (const call of result.toolCalls) {
        const execution = await executeAuthorizedTool(
          {
            userId: "system",
            organizationId: input.organizationId,
            role: "OWNER",
            email: "system@internal",
            name: "AI",
            agentId: agent.id,
            conversationId: input.conversationId,
            contactId: input.contactId,
          },
          call.name,
          call.arguments,
        );
        toolCalls.push({ name: call.name, arguments: call.arguments, result: execution });
        messages.push({
          role: "tool",
          name: call.name,
          toolCallId: call.id,
          content: JSON.stringify(execution).slice(0, 8000),
        });
      }
      result = await provider.generate({ messages, tools: toolSpecs });
      await recordUsage(input.organizationId, "ai.tokens", (result.usage?.inputTokens || 0) + (result.usage?.outputTokens || 0));
    }

    // Tools ran but the model never produced text (function-call-only
    // replies): ask once more WITHOUT tools so it must answer in words.
    if (!result.text && toolCalls.length) {
      try {
        const closing = await provider.generate({ messages, tools: [] });
        if (closing.text) result = closing;
      } catch (error) {
        console.error("[agent] closing reply failed:", error instanceof Error ? error.message : "unknown");
      }
    }

    const reply =
      result.text ||
      agent.fallbackResponse ||
      "I do not have that information yet. Would you like me to connect you with a teammate?";

    return {
      reply,
      toolCalls,
      knowledgeUsed,
      responseTimeMs: Date.now() - started,
    };
  } catch (error) {
    // Customer-facing fallback is deliberately generic: never leak raw API
    // errors, stack traces, keys, or internal details to the chat. Technical
    // detail goes to the server-side audit log only (sanitized — no prompts,
    // no user text, no secrets).
    const code = error instanceof AppError ? error.code : "UNKNOWN";
    await writeAuditLog({
      organizationId: input.organizationId,
      action: "ai.request.failed",
      entityType: "agent",
      entityId: input.agentId,
      metadata: { code, mode: input.mode },
    });
    return {
      reply:
        "Sorry, I'm having trouble responding right now. Please try again in a moment or ask to speak with a team member.",
      toolCalls,
      knowledgeUsed,
      responseTimeMs: Date.now() - started,
      error: error instanceof Error ? error.message : "unknown",
    };
  }
}
