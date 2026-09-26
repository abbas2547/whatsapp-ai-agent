"use server";

import { z } from "zod";
import { assertCanManageAgents, requireOrgContext } from "@/lib/tenant";
import { addDocument, createKnowledgeBase } from "@/services/knowledge/knowledge.service";
import { fail } from "./_shared";

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
