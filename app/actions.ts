"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { AgentGoal, AgentStatus, LeadStatus, MemberRole } from "@prisma/client";
import { auth, signIn } from "@/auth";
import { db } from "@/lib/db";
import { AppError, UnauthorizedError, publicErrorMessage } from "@/lib/errors";
import { assertAdmin, assertCanManageAgents, assertCanWrite, requireOrgContext } from "@/lib/tenant";
import { registerWorkspace, updateMemberRole, createWorkspaceForUser } from "@/services/organization/organization.service";
import { connectWhatsApp, sendHumanMessage } from "@/services/whatsapp/connect";
import { createAgent, publishAgent, updateAgent } from "@/services/ai/agent.service";
import { processAgentTurn } from "@/services/ai/runtime";
import { addDocument, createKnowledgeBase } from "@/services/knowledge/knowledge.service";
import { addTag, importContacts, removeTag, updateContact } from "@/services/contacts/contact.service";
import { updateLead } from "@/services/leads/lead.service";
import { markConversationRead, setConversationAi, updateConversationStatus } from "@/services/inbox/conversation.service";
import { returnToAi, transferToHuman } from "@/services/inbox/handoff.service";
import { saveWorkflowGraph } from "@/services/automation/engine";
import { encryptSecret } from "@/lib/encryption";
import { writeAuditLog } from "@/services/audit/audit.service";

function fail(error: unknown) {
  return { ok: false as const, error: publicErrorMessage(error) };
}

export async function registerAction(formData: FormData) {
  try {
    const parsed = z
      .object({
        name: z.string().min(2),
        email: z.string().email(),
        password: z.string().min(8),
        organizationName: z.string().min(2),
      })
      .parse({
        name: formData.get("name"),
        email: formData.get("email"),
        password: formData.get("password"),
        organizationName: formData.get("organizationName"),
      });
    await registerWorkspace(parsed);
  } catch (error) {
    return fail(error);
  }
  // signIn throws NEXT_REDIRECT on success — let it propagate. Any other
  // failure (e.g. session write hiccup) still means the account WAS created,
  // so send the user to login instead of showing a crash page.
  try {
    await signIn("credentials", {
      email: String(formData.get("email")),
      password: String(formData.get("password")),
      redirectTo: "/dashboard",
    });
  } catch (error) {
    if ((error as { digest?: string })?.digest?.startsWith("NEXT_REDIRECT")) throw error;
    redirect("/login?created=1");
  }
}

export async function createWorkspaceAction(organizationName: string) {
  try {
    const session = await auth();
    if (!session?.user?.id) throw new UnauthorizedError();
    const org = await createWorkspaceForUser(session.user.id, organizationName);
    return { ok: true as const, organizationId: org.id };
  } catch (error) {
    return fail(error);
  }
}

export async function loginAction(formData: FormData) {
  try {
    await signIn("credentials", {
      email: String(formData.get("email") || ""),
      password: String(formData.get("password") || ""),
      redirectTo: "/dashboard",
    });
  } catch (error) {
    if ((error as { digest?: string })?.digest?.startsWith("NEXT_REDIRECT")) throw error;
    return fail(new AppError("Invalid email or password", "INVALID_LOGIN", 401));
  }
}

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

export async function testAgentAction(agentId: string, message: string, history: Array<{ role: "user" | "assistant"; content: string }>) {
  try {
    const ctx = await requireOrgContext();
    const started = Date.now();
    const result = await processAgentTurn({
      organizationId: ctx.organizationId,
      agentId,
      userMessage: message,
      history,
      mode: "test",
    });
    return { ok: true as const, ...result, responseTimeMs: result.responseTimeMs || Date.now() - started };
  } catch (error) {
    return fail(error);
  }
}

export async function connectWhatsAppAction(input: { wabaId: string; phoneNumberId: string; accessToken: string; displayPhoneNumber?: string }) {
  try {
    const ctx = await requireOrgContext();
    assertAdmin(ctx);
    return { ok: true as const, ...(await connectWhatsApp(ctx.organizationId, ctx.userId, input)) };
  } catch (error) {
    return fail(error);
  }
}

export async function sendInboxMessageAction(conversationId: string, text: string) {
  try {
    const ctx = await requireOrgContext();
    assertCanWrite(ctx);
    const message = await sendHumanMessage({
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      conversationId,
      text,
    });
    return { ok: true as const, message };
  } catch (error) {
    return fail(error);
  }
}

export async function pauseAiAction(conversationId: string, enabled: boolean) {
  try {
    const ctx = await requireOrgContext();
    assertCanWrite(ctx);
    await setConversationAi(ctx.organizationId, conversationId, enabled);
    return { ok: true as const };
  } catch (error) {
    return fail(error);
  }
}

export async function transferConversationAction(conversationId: string, reason: string) {
  try {
    const ctx = await requireOrgContext();
    assertCanWrite(ctx);
    await transferToHuman({
      organizationId: ctx.organizationId,
      conversationId,
      reason,
      actorUserId: ctx.userId,
      assignUserId: ctx.userId,
    });
    return { ok: true as const };
  } catch (error) {
    return fail(error);
  }
}

export async function returnToAiAction(conversationId: string) {
  try {
    const ctx = await requireOrgContext();
    assertCanWrite(ctx);
    await returnToAi(ctx.organizationId, conversationId, ctx.userId);
    return { ok: true as const };
  } catch (error) {
    return fail(error);
  }
}

export async function resolveConversationAction(conversationId: string) {
  try {
    const ctx = await requireOrgContext();
    assertCanWrite(ctx);
    await updateConversationStatus(ctx.organizationId, conversationId, "RESOLVED");
    await markConversationRead(ctx.organizationId, conversationId);
    return { ok: true as const };
  } catch (error) {
    return fail(error);
  }
}

export async function markReadAction(conversationId: string) {
  const ctx = await requireOrgContext();
  await markConversationRead(ctx.organizationId, conversationId);
}

export async function createKnowledgeBaseAction(name: string, description?: string) {
  try {
    const ctx = await requireOrgContext();
    assertCanManageAgents(ctx);
    return { ok: true as const, kb: await createKnowledgeBase(ctx.organizationId, ctx.userId, name, description) };
  } catch (error) {
    return fail(error);
  }
}

export async function addManualKnowledgeAction(knowledgeBaseId: string, name: string, content: string, sourceType: "manual" | "faq" | "product") {
  try {
    const ctx = await requireOrgContext();
    assertCanManageAgents(ctx);
    const doc = await addDocument({
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      knowledgeBaseId,
      name,
      sourceType,
      content,
    });
    return { ok: true as const, doc };
  } catch (error) {
    return fail(error);
  }
}

export async function updateLeadAction(leadId: string, data: { status?: LeadStatus; notes?: string; score?: number }) {
  try {
    const ctx = await requireOrgContext();
    assertCanWrite(ctx);
    return { ok: true as const, lead: await updateLead(ctx.organizationId, leadId, data) };
  } catch (error) {
    return fail(error);
  }
}

export async function updateContactAction(contactId: string, data: Record<string, unknown>) {
  try {
    const ctx = await requireOrgContext();
    assertCanWrite(ctx);
    return { ok: true as const, contact: await updateContact(ctx.organizationId, contactId, data) };
  } catch (error) {
    return fail(error);
  }
}

export async function importContactsAction(csv: string) {
  try {
    const ctx = await requireOrgContext();
    assertCanWrite(ctx);
    const rows = csv
      .split(/\r?\n/)
      .slice(1)
      .map((line) => {
        const [name, phone, email, company] = line.split(",").map((s) => s?.trim());
        return { name, phone: phone || "", email, company };
      })
      .filter((r) => r.phone);
    return { ok: true as const, ...(await importContacts(ctx.organizationId, rows)) };
  } catch (error) {
    return fail(error);
  }
}

export async function addTagAction(contactId: string, name: string) {
  try {
    const ctx = await requireOrgContext();
    assertCanWrite(ctx);
    await addTag(ctx.organizationId, contactId, name);
    return { ok: true as const };
  } catch (error) {
    return fail(error);
  }
}

export async function removeTagAction(contactId: string, name: string) {
  try {
    const ctx = await requireOrgContext();
    assertCanWrite(ctx);
    await removeTag(ctx.organizationId, contactId, name);
    return { ok: true as const };
  } catch (error) {
    return fail(error);
  }
}

export async function saveWorkflowAction(workflowId: string | undefined, payload: { name: string; enabled?: boolean; publishState?: "DRAFT" | "PUBLISHED"; nodes: unknown[]; edges: unknown[] }) {
  try {
    const ctx = await requireOrgContext();
    assertCanManageAgents(ctx);
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
        data: { name: payload.name, enabled: payload.enabled, publishState: payload.publishState },
      });
    } else {
      const created = await db.workflow.create({
        data: { organizationId: ctx.organizationId, name: payload.name, enabled: false },
      });
      resolvedId = created.id;
    }
    await saveWorkflowGraph(ctx.organizationId, resolvedId, {
      nodes: payload.nodes as never,
      edges: payload.edges as never,
    });
    return { ok: true as const, id: resolvedId };
  } catch (error) {
    return fail(error);
  }
}

export async function saveHttpIntegrationAction(input: {
  name: string;
  url: string;
  method: "GET" | "POST" | "PUT" | "PATCH";
  headers?: Record<string, string>;
  secret?: string;
  authHeader?: string;
}) {
  try {
    const ctx = await requireOrgContext();
    assertAdmin(ctx);
    const integration = await db.integration.create({
      data: {
        organizationId: ctx.organizationId,
        provider: "HTTP",
        name: input.name,
        enabled: true,
        config: {
          url: input.url,
          method: input.method,
          headers: input.headers || {},
          authHeader: input.authHeader || "Authorization",
        },
      },
    });
    if (input.secret) {
      await db.apiCredential.create({
        data: {
          organizationId: ctx.organizationId,
          provider: `http:${integration.id}`,
          label: input.name,
          encryptedValue: encryptSecret(input.secret),
        },
      });
    }
    await writeAuditLog({
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      action: "integration.http.created",
      entityType: "integration",
      entityId: integration.id,
    });
    return { ok: true as const, id: integration.id };
  } catch (error) {
    return fail(error);
  }
}

export async function saveQualificationAction(fields: Array<{ key: string; label: string; required: boolean }>) {
  try {
    const ctx = await requireOrgContext();
    assertCanManageAgents(ctx);
    await db.qualificationField.deleteMany({ where: { organizationId: ctx.organizationId } });
    await db.qualificationField.createMany({
      data: fields.map((f, sortOrder) => ({
        organizationId: ctx.organizationId,
        key: f.key,
        label: f.label,
        required: f.required,
        sortOrder,
      })),
    });
    return { ok: true as const };
  } catch (error) {
    return fail(error);
  }
}

export async function updateMemberRoleAction(memberId: string, role: MemberRole) {
  try {
    const ctx = await requireOrgContext();
    assertAdmin(ctx);
    await updateMemberRole(ctx.organizationId, ctx.userId, memberId, role);
    return { ok: true as const };
  } catch (error) {
    return fail(error);
  }
}

export async function updateOrgNameAction(name: string) {
  try {
    const ctx = await requireOrgContext();
    assertAdmin(ctx);
    await db.organization.update({ where: { id: ctx.organizationId }, data: { name } });
    return { ok: true as const };
  } catch (error) {
    return fail(error);
  }
}

export async function requireSessionOrRedirect() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  // Authenticated (e.g. first Google sign-in) but no workspace yet.
  if (!session.user.organizationId) redirect("/onboarding");
  return session;
}
