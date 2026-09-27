"use server";

import { AppError } from "@/lib/errors";
import { rateLimit } from "@/lib/rate-limit";
import { assertCanManageAgents, requireOrgContext } from "@/lib/tenant";
import { createAgent, deleteAgent, publishAgent, updateAgent } from "@/services/ai/agent.service";
import { processAgentTurn } from "@/services/ai/runtime";
import { fail } from "./_shared";

export async function saveAgentAction(id: string | undefined, payload: Record<string, unknown>) {
  try {
    const ctx = await requireOrgContext();
    assertCanManageAgents(ctx);
    if (id) return { ok: true as const, agent: await updateAgent(ctx.organizationId, ctx.userId, id, payload) };
    return { ok: true as const, agent: await createAgent(ctx.organizationId, ctx.userId, payload as never) };
  } catch (error) {
    return fail(error);
  }
}

export async function publishAgentAction(id: string) {
  try {
    const ctx = await requireOrgContext();
    assertCanManageAgents(ctx);
    return { ok: true as const, agent: await publishAgent(ctx.organizationId, ctx.userId, id) };
  } catch (error) {
    return fail(error);
  }
}

export async function setAgentStatusAction(id: string, status: "ACTIVE" | "PAUSED" | "DRAFT") {
  try {
    const ctx = await requireOrgContext();
    assertCanManageAgents(ctx);
    if (status === "ACTIVE") {
      return { ok: true as const, agent: await publishAgent(ctx.organizationId, ctx.userId, id) };
    }
    return { ok: true as const, agent: await updateAgent(ctx.organizationId, ctx.userId, id, { status }) };
  } catch (error) {
    return fail(error);
  }
}

export async function deleteAgentAction(id: string) {
  try {
    const ctx = await requireOrgContext();
    assertCanManageAgents(ctx);
    if (!id || id.length > 64) throw new AppError("Invalid agent.", "INVALID_INPUT", 400);
    return { ok: true as const, ...(await deleteAgent(ctx.organizationId, ctx.userId, id)) };
  } catch (error) {
    return fail(error);
  }
}

export async function testAgentAction(agentId: string, message: string, history: Array<{ role: "user" | "assistant"; content: string }>) {
  try {
    const ctx = await requireOrgContext();
    assertCanManageAgents(ctx);
    const limited = rateLimit(`test-agent:${ctx.userId}`, 20, 60_000);
    if (!limited.success) {
      throw new AppError("Too many test runs. Please wait a moment.", "RATE_LIMITED", 429);
    }
    const cleanMessage = String(message || "").slice(0, 4000);
    if (!cleanMessage.trim()) throw new AppError("Enter a message to test.", "INVALID_INPUT", 400);
    const cleanHistory = (Array.isArray(history) ? history : []).slice(-20).map((h) => ({
      role: h.role === "assistant" ? ("assistant" as const) : ("user" as const),
      content: String(h.content || "").slice(0, 4000),
    }));
    if (!agentId || agentId.length > 64) throw new AppError("Invalid agent.", "INVALID_INPUT", 400);
    const started = Date.now();
    const result = await processAgentTurn({
      organizationId: ctx.organizationId,
      agentId,
      userMessage: cleanMessage,
      history: cleanHistory,
      mode: "test",
    });
    return { ok: true as const, ...result, responseTimeMs: result.responseTimeMs || Date.now() - started };
  } catch (error) {
    return fail(error);
  }
}

export async function createAgentFromWebsiteAction(url: string) {
  try {
    const ctx = await requireOrgContext();
    assertCanManageAgents(ctx);
    const limited = rateLimit(`website-agent:${ctx.userId}`, 5, 10 * 60_000);
    if (!limited.success) {
      throw new AppError("Too many website imports. Please wait a few minutes.", "RATE_LIMITED", 429);
    }
    const clean = String(url || "").trim().slice(0, 500);
    if (!clean) throw new AppError("Enter your business website URL.", "INVALID_URL", 400);
    const { createAgentFromWebsite } = await import("@/services/ai/website-agent");
    const created = await createAgentFromWebsite(ctx.organizationId, ctx.userId, clean);
    return {
      ok: true as const,
      agentId: created.agent.id,
      agentName: created.agent.name,
      pagesCrawled: created.pagesCrawled,
      hostname: created.hostname,
    };
  } catch (error) {
    return fail(error);
  }
}
