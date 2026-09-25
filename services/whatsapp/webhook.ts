import { after } from "next/server";
import { MessageType, Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { formatPhone } from "@/lib/utils";
import { writeAuditLog, recordUsage } from "@/services/audit/audit.service";
import { processAgentTurn } from "@/services/ai/runtime";
import { triggerWorkflows } from "@/services/automation/engine";
import { markWhatsAppRead, resolveAccessToken, sendWhatsAppMessage } from "@/services/whatsapp/client";

export type MetaWebhookPayload = {
  object?: string;
  entry?: Array<{
    id?: string;
    changes?: Array<{
      field?: string;
      value?: {
        messaging_product?: string;
        metadata?: { display_phone_number?: string; phone_number_id?: string };
        contacts?: Array<{ wa_id?: string; profile?: { name?: string } }>;
        messages?: Array<Record<string, unknown>>;
        statuses?: Array<Record<string, unknown>>;
      };
    }>;
  }>;
};

function mapMessageType(type?: string): MessageType {
  switch (type) {
    case "text":
      return "TEXT";
    case "image":
      return "IMAGE";
    case "document":
      return "DOCUMENT";
    case "video":
      return "VIDEO";
    case "audio":
    case "voice":
      return "AUDIO";
    case "interactive":
      return "INTERACTIVE";
    case "button":
      return "BUTTON";
    case "template":
      return "TEMPLATE";
    case "reaction":
      return "REACTION";
    case "sticker":
      return "STICKER";
    case "location":
      return "LOCATION";
    case "contacts":
      return "CONTACTS";
    default:
      return "UNKNOWN";
  }
}

function extractText(message: Record<string, unknown>) {
  const type = String(message.type || "");
  if (type === "text") return (message.text as { body?: string } | undefined)?.body || "";
  if (type === "button") return (message.button as { text?: string } | undefined)?.text || "";
  if (type === "interactive") {
    const interactive = message.interactive as {
      button_reply?: { title?: string; id?: string };
      list_reply?: { title?: string; id?: string };
    };
    return interactive?.button_reply?.title || interactive?.list_reply?.title || "";
  }
  const caption =
    (message.image as { caption?: string } | undefined)?.caption ||
    (message.video as { caption?: string } | undefined)?.caption ||
    (message.document as { caption?: string } | undefined)?.caption;
  return caption || `[${type || "message"}]`;
}

export async function handleWhatsAppWebhook(payload: MetaWebhookPayload) {
  if (payload.object !== "whatsapp_business_account") {
    return { ignored: true };
  }

  for (const entry of payload.entry || []) {
    const wabaId = entry.id;
    for (const change of entry.changes || []) {
      if (change.field !== "messages") continue;
      const value = change.value;
      if (!value) continue;
      const phoneNumberId = value.metadata?.phone_number_id;
      if (!phoneNumberId) continue;

      const phone = await db.whatsAppPhoneNumber.findUnique({
        where: { phoneNumberId },
        include: { account: true },
      });
      if (!phone) continue;
      if (wabaId && phone.account.wabaId !== wabaId) continue;

      for (const status of value.statuses || []) {
        await applyMessageStatus(phone.organizationId, status);
      }

      for (const message of value.messages || []) {
        const contactProfile = value.contacts?.find((c) => c.wa_id === message.from) || value.contacts?.[0];
        after(() =>
          processIncomingMessage({
            organizationId: phone.organizationId,
            phone,
            message,
            contactName: contactProfile?.profile?.name,
          }).catch((error) => {
            console.error("whatsapp inbound processing failed", error instanceof Error ? error.message : "unknown");
          }),
        );
      }
    }
  }

  return { ok: true };
}

async function applyMessageStatus(organizationId: string, status: Record<string, unknown>) {
  const externalId = String(status.id || "");
  if (!externalId) return;
  const mapped =
    status.status === "read"
      ? "READ"
      : status.status === "delivered"
        ? "DELIVERED"
        : status.status === "failed"
          ? "FAILED"
          : status.status === "sent"
            ? "SENT"
            : null;
  if (!mapped) return;
  await db.message.updateMany({
    where: { organizationId, externalMessageId: externalId },
    data: { status: mapped },
  });
}

async function processIncomingMessage(input: {
  organizationId: string;
  phone: Prisma.WhatsAppPhoneNumberGetPayload<{ include: { account: true } }>;
  message: Record<string, unknown>;
  contactName?: string;
}) {
  const externalId = String(input.message.id || "");
  if (!externalId) return;

  try {
    await db.processedWebhookEvent.create({
      data: {
        id: `wa:${externalId}`,
        organizationId: input.organizationId,
        source: "whatsapp",
      },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return;
    }
    throw error;
  }

  const from = formatPhone(String(input.message.from || ""));
  if (!from) return;

  const contact = await db.contact.upsert({
    where: { organizationId_phone: { organizationId: input.organizationId, phone: from } },
    update: input.contactName ? { name: input.contactName } : {},
    create: {
      organizationId: input.organizationId,
      phone: from,
      name: input.contactName,
      source: "whatsapp",
    },
  });

  const conversation = await db.conversation.upsert({
    where: {
      organizationId_contactId_whatsappPhoneNumberId: {
        organizationId: input.organizationId,
        contactId: contact.id,
        whatsappPhoneNumberId: input.phone.id,
      },
    },
    update: {
      lastMessageAt: new Date(),
      unreadCount: { increment: 1 },
    },
    create: {
      organizationId: input.organizationId,
      contactId: contact.id,
      whatsappPhoneNumberId: input.phone.id,
      lastMessageAt: new Date(),
      unreadCount: 1,
      status: "AI_ACTIVE",
      aiEnabled: true,
    },
  });

  const content = extractText(input.message);
  await db.message.create({
    data: {
      organizationId: input.organizationId,
      conversationId: conversation.id,
      contactId: contact.id,
      externalMessageId: externalId,
      direction: "INBOUND",
      senderType: "CUSTOMER",
      messageType: mapMessageType(String(input.message.type || "")),
      content,
      metadata: input.message as Prisma.InputJsonValue,
      status: "DELIVERED",
    },
  });

  await recordUsage(input.organizationId, "messages.received");
  await triggerWorkflows(input.organizationId, "whatsapp.message.received", {
    conversationId: conversation.id,
    contactId: contact.id,
    message: content,
  });

  const live = await db.conversation.findUnique({ where: { id: conversation.id } });
  if (!live?.aiEnabled || live.status === "HUMAN_ACTIVE" || live.status === "WAITING_FOR_HUMAN") {
    return;
  }

  const agent = live.activeAgentId
    ? await db.agent.findFirst({
        where: { id: live.activeAgentId, organizationId: input.organizationId, status: "ACTIVE" },
      })
    : await db.agent.findFirst({
        where: {
          organizationId: input.organizationId,
          status: "ACTIVE",
          OR: [{ whatsappPhoneNumberId: input.phone.id }, { whatsappPhoneNumberId: null }],
        },
        orderBy: { updatedAt: "desc" },
      });

  if (!agent) return;

  if (!live.activeAgentId) {
    await db.conversation.update({
      where: { id: live.id },
      data: { activeAgentId: agent.id },
    });
  }

  try {
    const token = resolveAccessToken(input.phone.account.accessTokenEncrypted);
    await markWhatsAppRead(input.phone.phoneNumberId, token, externalId);
  } catch {
    // Read receipts are optional.
  }

  const turn = await processAgentTurn({
    organizationId: input.organizationId,
    agentId: agent.id,
    conversationId: conversation.id,
    contactId: contact.id,
    userMessage: content,
    mode: "production",
  });

  if (!turn.reply) return;

  try {
    const token = resolveAccessToken(input.phone.account.accessTokenEncrypted);
    const waId = await sendWhatsAppMessage({
      phoneNumberId: input.phone.phoneNumberId,
      accessToken: token,
      to: contact.phone,
      type: "text",
      text: turn.reply,
    });
    await db.message.create({
      data: {
        organizationId: input.organizationId,
        conversationId: conversation.id,
        contactId: contact.id,
        externalMessageId: waId,
        direction: "OUTBOUND",
        senderType: "AI",
        messageType: "TEXT",
        content: turn.reply,
        metadata: { toolCalls: turn.toolCalls, knowledge: turn.knowledgeUsed } as Prisma.InputJsonValue,
        status: "SENT",
      },
    });
    await db.conversation.update({
      where: { id: conversation.id },
      data: { lastMessageAt: new Date() },
    });
    await recordUsage(input.organizationId, "messages.sent");
    await recordUsage(input.organizationId, "ai.handled");
  } catch (error) {
    await writeAuditLog({
      organizationId: input.organizationId,
      action: "whatsapp.send_failed",
      entityType: "conversation",
      entityId: conversation.id,
      metadata: { reason: error instanceof Error ? error.message : "unknown" },
    });
  }
}
