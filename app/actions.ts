"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { LeadStatus, MemberRole } from "@prisma/client";
import { auth, signIn } from "@/auth";
import { db } from "@/lib/db";
import { AppError, ForbiddenError, LimitError, UnauthorizedError, publicErrorMessage } from "@/lib/errors";
import { rateLimit } from "@/lib/rate-limit";
import { safeNextPath } from "@/lib/utils";
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
  const code = error instanceof AppError ? error.code : undefined;
  const extra =
    error instanceof LimitError ? { upgradePlan: error.upgradePlan } : {};
  return { ok: false as const, error: publicErrorMessage(error), code, ...extra };
}

export async function registerAction(formData: FormData) {
  // Basic abuse guard keyed on email (server actions have no trusted IP).
  try {
    const rawEmail = String(formData.get("email") || "").toLowerCase().trim();
    if (rawEmail) {
      const limited = rateLimit(`register:${rawEmail}`, 5, 60 * 60_000);
      if (!limited.success) {
        return fail(new AppError("Too many attempts. Please try again later.", "RATE_LIMITED", 429));
      }
    }
    const parsed = z
      .object({
        name: z.string().trim().min(2, "Please enter your name").max(100),
        email: z.string().trim().email("Please enter a valid email address").max(254),
        password: z.string().min(8, "Password must be at least 8 characters").max(72, "Password must be at most 72 characters"),
        confirmPassword: z.string().min(1, "Please confirm your password").max(72),
        organizationName: z.string().trim().min(2, "Please name your workspace").max(100),
      })
      .refine((v) => v.password === v.confirmPassword, {
        message: "Passwords do not match",
        path: ["confirmPassword"],
      })
      .parse({
        name: formData.get("name"),
        email: formData.get("email"),
        password: formData.get("password"),
        confirmPassword: formData.get("confirmPassword"),
        organizationName: formData.get("organizationName"),
      });
    await registerWorkspace(parsed);
  } catch (error) {
    return fail(error);
  }
  // Spec flow is Register → Login (no auto sign-in): the new user signs in
  // explicitly so credentials are verified through the real auth provider.
  const next = safeNextPath(formData.get("next"));
  redirect(next ? `/login?created=1&next=${encodeURIComponent(next)}` : "/login?created=1");
}

export async function createWorkspaceAction(organizationName: string) {
  try {
    const session = await auth();
    if (!session?.user?.id) throw new UnauthorizedError();
    const name = z.string().trim().min(2).max(100).parse(organizationName);
    const org = await createWorkspaceForUser(session.user.id, name);
    return { ok: true as const, organizationId: org.id };
  } catch (error) {
    return fail(error);
  }
}

export async function createAdditionalWorkspaceAction(organizationName: string) {
  try {
    const session = await auth();
    if (!session?.user?.id) throw new UnauthorizedError();
    const name = z.string().trim().min(2).max(100).parse(organizationName);
    const org = await createWorkspaceForUser(session.user.id, name, { allowMultiple: true });
    return { ok: true as const, organizationId: org.id };
  } catch (error) {
    return fail(error);
  }
}

export async function listMyWorkspacesAction() {
  try {
    const session = await auth();
    if (!session?.user?.id) throw new UnauthorizedError();
    const { listUserWorkspaces } = await import("@/services/organization/organization.service");
    return { ok: true as const, workspaces: await listUserWorkspaces(session.user.id) };
  } catch (error) {
    return fail(error);
  }
}

/**
 * Verifies membership server-side and returns the verified org. The client
 * then refreshes its JWT via `update()`; the jwt callback re-validates
 * membership before accepting the switch (never trusts the browser).
 */
export async function switchWorkspaceAction(organizationId: string) {
  try {
    const session = await auth();
    if (!session?.user?.id) throw new UnauthorizedError();
    const membership = await db.organizationMember.findFirst({
      where: { userId: session.user.id, organizationId },
      select: { organizationId: true, role: true, organization: { select: { name: true } } },
    });
    if (!membership) throw new ForbiddenError("You don't belong to that workspace");
    return { ok: true as const, organizationId: membership.organizationId, role: membership.role };
  } catch (error) {
    return fail(error);
  }
}

export async function completeOnboardingAction() {
  try {
    const ctx = await requireOrgContext();
    await db.organization.update({
      where: { id: ctx.organizationId },
      data: { onboardingCompletedAt: new Date() },
    });
    await writeAuditLog({
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      action: "workspace.onboarding_completed",
      entityType: "organization",
      entityId: ctx.organizationId,
    });
    return { ok: true as const };
  } catch (error) {
    return fail(error);
  }
}

export async function loginAction(formData: FormData) {
  const email = String(formData.get("email") || "").toLowerCase().trim().slice(0, 254);
  const password = String(formData.get("password") || "").slice(0, 72);
  const next = safeNextPath(formData.get("next")) ?? "/dashboard";
  if (!email || !password) {
    return fail(new AppError("Enter your email and password.", "INVALID_LOGIN", 401));
  }
  // Brute-force guard: key on the account identifier (IP headers are spoofable
  // in server actions, so email is the stable key). 10 attempts / 10 min.
  const limited = rateLimit(`login:${email}`, 10, 10 * 60_000);
  if (!limited.success) {
    return fail(new AppError("Too many login attempts. Please wait a few minutes and try again.", "RATE_LIMITED", 429));
  }
  // NOTE: no pre-lookup — returning distinct "account not found" vs "wrong
  // password" lets attackers enumerate registered emails. Always go through
  // the real provider and return one generic message.
  try {
    await signIn("credentials", { email, password, redirectTo: next });
  } catch (error) {
    if ((error as { digest?: string })?.digest?.startsWith("NEXT_REDIRECT")) throw error;
    return fail(new AppError("Invalid email or password.", "INVALID_LOGIN", 401));
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
  try {
    const ctx = await requireOrgContext();
    assertCanWrite(ctx);
    if (!conversationId || conversationId.length > 64) throw new AppError("Invalid conversation.", "INVALID_INPUT", 400);
    await markConversationRead(ctx.organizationId, conversationId);
    return { ok: true as const };
  } catch (error) {
    return fail(error);
  }
}

export async function createKnowledgeBaseAction(name: string, description?: string) {
  try {
    const ctx = await requireOrgContext();
    assertCanManageAgents(ctx);
    const parsedName = z.string().trim().min(1).max(100).parse(name);
    const parsedDesc = description ? z.string().max(500).parse(description) : undefined;
    return { ok: true as const, kb: await createKnowledgeBase(ctx.organizationId, ctx.userId, parsedName, parsedDesc) };
  } catch (error) {
    return fail(error);
  }
}

export async function addManualKnowledgeAction(knowledgeBaseId: string, name: string, content: string, sourceType: "manual" | "faq" | "product") {
  try {
    const ctx = await requireOrgContext();
    assertCanManageAgents(ctx);
    const parsed = z.object({
      knowledgeBaseId: z.string().min(1).max(64),
      name: z.string().trim().min(1).max(120),
      content: z.string().min(1).max(200_000),
      sourceType: z.enum(["manual", "faq", "product"]),
    }).parse({ knowledgeBaseId, name, content, sourceType });
    const doc = await addDocument({
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      knowledgeBaseId: parsed.knowledgeBaseId,
      name: parsed.name,
      sourceType: parsed.sourceType,
      content: parsed.content,
    });
    return { ok: true as const, doc };
  } catch (error) {
    return fail(error);
  }
}

export async function deleteKnowledgeDocumentAction(documentId: string) {
  try {
    const ctx = await requireOrgContext();
    assertCanManageAgents(ctx);
    const { deleteDocument } = await import("@/services/knowledge/knowledge.service");
    return { ok: true as const, ...(await deleteDocument(ctx.organizationId, ctx.userId, documentId)) };
  } catch (error) {
    return fail(error);
  }
}

export async function retryKnowledgeDocumentAction(documentId: string) {
  try {
    const ctx = await requireOrgContext();
    assertCanManageAgents(ctx);
    const { retryDocument } = await import("@/services/knowledge/knowledge.service");
    return { ok: true as const, ...(await retryDocument(ctx.organizationId, ctx.userId, documentId)) };
  } catch (error) {
    return fail(error);
  }
}

export async function previewKnowledgeDocumentAction(documentId: string) {
  try {
    const ctx = await requireOrgContext();
    const { getDocumentExcerpt } = await import("@/services/knowledge/knowledge.service");
    return { ok: true as const, doc: await getDocumentExcerpt(ctx.organizationId, documentId) };
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
    if (typeof csv !== "string" || !csv) throw new AppError("No CSV data provided.", "INVALID_INPUT", 400);
    if (csv.length > 500_000) throw new AppError("CSV is too large (max 500 KB). Split the import.", "LIMIT", 400);
    const limited = rateLimit(`import:${ctx.organizationId}`, 10, 60_000);
    if (!limited.success) throw new AppError("Too many imports. Please wait a minute.", "RATE_LIMITED", 429);
    const lines = csv.split(/\r?\n/).slice(0, 2001);
    // Minimal quoted-CSV parser (handles "a,b",c and escaped "").
    const parseLine = (line: string): string[] => {
      const out: string[] = [];
      let cur = "";
      let quoted = false;
      for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (quoted) {
          if (ch === '"') {
            if (line[i + 1] === '"') { cur += '"'; i++; }
            else quoted = false;
          } else cur += ch;
        } else if (ch === '"') quoted = true;
        else if (ch === ",") { out.push(cur); cur = ""; }
        else cur += ch;
      }
      out.push(cur);
      return out.map((s) => s.trim().slice(0, 200));
    };
    const rows = lines
      .slice(1, 1001)
      .flatMap((line) => {
        if (!line.trim()) return [] as Array<{ name?: string; phone: string; email?: string; company?: string }>;
        const [name, phone, email, company] = parseLine(line);
        if (!phone) return [] as Array<{ name?: string; phone: string; email?: string; company?: string }>;
        return [{ name, phone, email, company }];
      });
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
    const parsed = z.object({
      name: z.string().trim().min(1).max(100),
      url: z.string().trim().min(1).max(2048),
      method: z.enum(["GET", "POST", "PUT", "PATCH"]),
      headers: z.record(z.string(), z.string()).optional(),
      secret: z.string().max(2000).optional(),
      authHeader: z.string().max(64).optional(),
    }).parse(input);
    // SSRF guard at write time (also enforced at request time): https only,
    // no private/loopback/metadata hosts, no embedded credentials.
    let endpoint: URL;
    try {
      endpoint = new URL(parsed.url);
    } catch {
      throw new AppError("URL must be a valid https URL.", "INVALID_INPUT", 400);
    }
    if (endpoint.protocol !== "https:") throw new AppError("URL must use https.", "INVALID_INPUT", 400);
    const host = endpoint.hostname.toLowerCase();
    const blocked =
      host === "localhost" || host.endsWith(".internal") || host.endsWith(".local") ||
      host === "metadata.google.internal" ||
      /^(\d{1,3}\.){3}\d{1,3}$/.test(host) &&
        (() => {
          const [a, b] = host.split(".").map(Number);
          return a === 10 || a === 127 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 169 && b === 254) || a === 0;
        })();
    if (blocked || endpoint.username || endpoint.password) {
      throw new AppError("That host is not allowed for HTTP integrations.", "INVALID_INPUT", 400);
    }
    if (parsed.headers) {
      const entries = Object.entries(parsed.headers);
      if (entries.length > 20) throw new AppError("Too many headers (max 20).", "INVALID_INPUT", 400);
      for (const [k, v] of entries) {
        if (k.length > 128 || v.length > 2000 || /[\r\n]/.test(k) || /[\r\n]/.test(v)) {
          throw new AppError("Invalid header name or value.", "INVALID_INPUT", 400);
        }
      }
    }
    const integration = await db.integration.create({
      data: {
        organizationId: ctx.organizationId,
        provider: "HTTP",
        name: parsed.name,
        enabled: true,
        config: {
          url: parsed.url,
          method: parsed.method,
          headers: parsed.headers || {},
          authHeader: parsed.authHeader || "Authorization",
        },
      },
    });
    if (parsed.secret) {
      await db.apiCredential.create({
        data: {
          organizationId: ctx.organizationId,
          provider: `http:${integration.id}`,
          label: parsed.name,
          encryptedValue: encryptSecret(parsed.secret),
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
    const parsed = z.array(z.object({
      key: z.string().trim().min(1).max(64).regex(/^[a-zA-Z0-9_-]+$/, "Invalid field key"),
      label: z.string().trim().min(1).max(100),
      required: z.boolean(),
    })).max(30).parse(fields);
    await db.qualificationField.deleteMany({ where: { organizationId: ctx.organizationId } });
    await db.qualificationField.createMany({
      data: parsed.map((f, sortOrder) => ({
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
    const parsedMemberId = z.string().min(1).max(64).parse(memberId);
    const parsedRole = z.enum(["OWNER", "ADMIN", "AGENT_MANAGER", "SUPPORT", "VIEWER"]).parse(role);
    // Admins can't demote themselves to avoid lockout via a single misclick;
    // last-owner protection lives in updateMemberRole.
    await updateMemberRole(ctx.organizationId, ctx.userId, parsedMemberId, parsedRole);
    return { ok: true as const };
  } catch (error) {
    return fail(error);
  }
}

export async function updateOrgNameAction(name: string) {
  try {
    const ctx = await requireOrgContext();
    assertAdmin(ctx);
    const parsed = z.string().trim().min(2).max(100).parse(name);
    await db.organization.update({ where: { id: ctx.organizationId }, data: { name: parsed } });
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
