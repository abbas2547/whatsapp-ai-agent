import { z } from "zod";
import { db } from "@/lib/db";
import { encryptSecret } from "@/lib/encryption";
import { env } from "@/lib/env";
import { AppError, LimitError } from "@/lib/errors";
import { canConnectWhatsAppNumber } from "@/services/billing/entitlements";
import { fetchPhoneNumber, resolveAccessToken, sendWhatsAppMessage } from "@/services/whatsapp/client";
import { writeAuditLog } from "@/services/audit/audit.service";

const connectSchema = z.object({
  wabaId: z.string().min(1),
  phoneNumberId: z.string().min(1),
  accessToken: z.string().min(10),
  displayPhoneNumber: z.string().optional(),
});

export async function connectWhatsApp(organizationId: string, userId: string, input: z.infer<typeof connectSchema>) {
  const parsed = connectSchema.parse(input);
  // A phoneNumberId already owned by ANOTHER workspace must never be
  // reassigned by upsert — reject the takeover attempt.
  const existingNumber = await db.whatsAppPhoneNumber.findUnique({
    where: { phoneNumberId: parsed.phoneNumberId },
    select: { organizationId: true },
  });
  if (existingNumber && existingNumber.organizationId !== organizationId) {
    throw new AppError("This WhatsApp number is already connected to another workspace.", "NUMBER_TAKEN", 409);
  }
  // Reconnecting our own number is free; only brand-new numbers count.
  if (!existingNumber) {
    const allowed = await canConnectWhatsAppNumber(organizationId);
    if (!allowed.ok) {
      throw new LimitError(
        `${allowed.message} Upgrade to ${allowed.upgradePlan === "starter" ? "Starter" : allowed.upgradePlan === "pro" ? "Pro" : "Business"} to connect more.`,
        "LIMIT_REACHED_NUMBERS",
        allowed.upgradePlan,
      );
    }
  }
  const encrypted = encryptSecret(parsed.accessToken);
  const lookup = await fetchPhoneNumber(parsed.phoneNumberId, parsed.accessToken);

  const account = await db.whatsAppAccount.upsert({
    where: { organizationId_wabaId: { organizationId, wabaId: parsed.wabaId } },
    update: {
      accessTokenEncrypted: encrypted,
      status: "connected",
      metaAppId: env().META_APP_ID,
    },
    create: {
      organizationId,
      wabaId: parsed.wabaId,
      accessTokenEncrypted: encrypted,
      status: "connected",
      metaAppId: env().META_APP_ID,
    },
  });

  const phone = await db.whatsAppPhoneNumber.upsert({
    where: { phoneNumberId: parsed.phoneNumberId },
    update: {
      organizationId,
      whatsappAccountId: account.id,
      displayPhoneNumber: lookup.display_phone_number || parsed.displayPhoneNumber || parsed.phoneNumberId,
      verifiedName: lookup.verified_name,
      qualityRating: lookup.quality_rating,
      isDefault: true,
    },
    create: {
      organizationId,
      whatsappAccountId: account.id,
      phoneNumberId: parsed.phoneNumberId,
      displayPhoneNumber: lookup.display_phone_number || parsed.displayPhoneNumber || parsed.phoneNumberId,
      verifiedName: lookup.verified_name,
      qualityRating: lookup.quality_rating,
      isDefault: true,
    },
  });

  await db.integration.upsert({
    where: { id: `${organizationId}-whatsapp` },
    update: { enabled: true, name: "WhatsApp Cloud API" },
    create: {
      id: `${organizationId}-whatsapp`,
      organizationId,
      provider: "WHATSAPP",
      name: "WhatsApp Cloud API",
      enabled: true,
    },
  }).catch(async () => {
    await db.integration.create({
      data: {
        organizationId,
        provider: "WHATSAPP",
        name: "WhatsApp Cloud API",
        enabled: true,
      },
    });
  });

  await writeAuditLog({
    organizationId,
    userId,
    action: "whatsapp.connected",
    entityType: "whatsapp_account",
    entityId: account.id,
  });

  return { account, phone };
}

export async function sendHumanMessage(input: {
  organizationId: string;
  userId: string;
  conversationId: string;
  text: string;
}) {
  const conversation = await db.conversation.findFirst({
    where: { id: input.conversationId, organizationId: input.organizationId },
    include: {
      contact: true,
      phoneNumber: { include: { account: true } },
    },
  });
  if (!conversation) throw new AppError("Conversation not found", "NOT_FOUND", 404);
  const token = resolveAccessToken(conversation.phoneNumber.account.accessTokenEncrypted);
  const waId = await sendWhatsAppMessage({
    phoneNumberId: conversation.phoneNumber.phoneNumberId,
    accessToken: token,
    to: conversation.contact.phone,
    type: "text",
    text: input.text,
  });
  const message = await db.message.create({
    data: {
      organizationId: input.organizationId,
      conversationId: conversation.id,
      contactId: conversation.contactId,
      externalMessageId: waId,
      direction: "OUTBOUND",
      senderType: "HUMAN",
      messageType: "TEXT",
      content: input.text,
      status: "SENT",
    },
  });
  await db.conversation.update({
    where: { id: conversation.id },
    data: { lastMessageAt: new Date(), unreadCount: 0 },
  });
  return message;
}

export async function getWhatsAppStatus(organizationId: string) {
  const account = await db.whatsAppAccount.findFirst({
    where: { organizationId },
    include: { phoneNumbers: true },
    orderBy: { updatedAt: "desc" },
  });
  return {
    connected: account?.status === "connected",
    webhookVerified: account?.webhookVerified ?? false,
    phones: account?.phoneNumbers ?? [],
    wabaId: account?.wabaId,
  };
}
