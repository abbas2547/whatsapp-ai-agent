"use server";

import { AppError } from "@/lib/errors";
import { assertCanWrite, requireOrgContext } from "@/lib/tenant";
import { sendHumanMessage } from "@/services/whatsapp/connect";
import { markConversationRead, setConversationAi, updateConversationStatus } from "@/services/inbox/conversation.service";
import { returnToAi, transferToHuman } from "@/services/inbox/handoff.service";
import { fail } from "./_shared";

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
