import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { writeAuditLog } from "@/services/audit/audit.service";
import { sendGmail } from "@/services/email/gmail";
import { triggerWorkflows } from "@/services/automation/engine";

export async function transferToHuman(input: {
  organizationId: string;
  conversationId: string;
  reason: string;
  actorUserId?: string;
  assignUserId?: string;
}) {
  const conversation = await db.conversation.findFirst({
    where: { id: input.conversationId, organizationId: input.organizationId },
    include: { contact: true },
  });
  if (!conversation) throw new AppError("Conversation not found", "NOT_FOUND", 404);

  const updated = await db.conversation.update({
    where: { id: conversation.id },
    data: {
      status: input.assignUserId ? "HUMAN_ACTIVE" : "WAITING_FOR_HUMAN",
      aiEnabled: false,
      assignedUserId: input.assignUserId,
      takeoverReason: input.reason,
    },
  });

  await db.message.create({
    data: {
      organizationId: input.organizationId,
      conversationId: conversation.id,
      contactId: conversation.contactId,
      direction: "OUTBOUND",
      senderType: "SYSTEM",
      messageType: "TEXT",
      content: `Conversation transferred to a human. Reason: ${input.reason}`,
      status: "SENT",
    },
  });

  await db.notification.create({
    data: {
      organizationId: input.organizationId,
      userId: input.assignUserId,
      type: "HANDOFF",
      title: "Human takeover requested",
      body: `${conversation.contact.name || conversation.contact.phone}: ${input.reason}`,
      metadata: { conversationId: conversation.id },
    },
  });

  await writeAuditLog({
    organizationId: input.organizationId,
    userId: input.actorUserId,
    action: "conversation.transferred",
    entityType: "conversation",
    entityId: conversation.id,
    metadata: { reason: input.reason },
  });

  await triggerWorkflows(input.organizationId, "conversation.handoff", {
    conversationId: conversation.id,
    reason: input.reason,
  });

  try {
    const owners = await db.organizationMember.findMany({
      where: { organizationId: input.organizationId, role: { in: ["OWNER", "ADMIN", "SUPPORT"] } },
      include: { user: true },
    });
    for (const member of owners) {
      await sendGmail(input.organizationId, {
        to: member.user.email,
        subject: "WhatsApp conversation needs a human",
        body: `${conversation.contact.name || conversation.contact.phone} requested help: ${input.reason}`,
      }).catch(() => undefined);
    }
  } catch {
    // Gmail may be unconfigured.
  }

  return updated;
}

export async function returnToAi(organizationId: string, conversationId: string, userId: string) {
  const updated = await db.conversation.updateMany({
    where: { id: conversationId, organizationId },
    data: { status: "AI_ACTIVE", aiEnabled: true, takeoverReason: null },
  });
  await writeAuditLog({
    organizationId,
    userId,
    action: "conversation.returned_to_ai",
    entityType: "conversation",
    entityId: conversationId,
  });
  return updated;
}
