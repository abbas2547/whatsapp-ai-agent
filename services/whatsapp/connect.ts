import { z } from "zod";
import { db } from "@/lib/db";
import { encryptSecret } from "@/lib/encryption";
import { env } from "@/lib/env";
import { AppError, LimitError } from "@/lib/errors";
import { canConnectWhatsAppNumber } from "@/services/billing/entitlements";
import { fetchPhoneNumber, fetchWabaPhoneNumbers, resolveAccessToken, sendWhatsAppMessage, verifyAccessToken } from "@/services/whatsapp/client";
import { writeAuditLog } from "@/services/audit/audit.service";

// Simplified (n8n-style) credentials: only Client ID + Client Secret.
// Client ID = WABA ID, Client Secret = permanent access token. The phone
// number is auto-discovered from the WABA so users never type IDs manually.
// Legacy callers may still pass wabaId/phoneNumberId/accessToken explicitly.
const connectSchema = z.object({
  wabaId: z.string().min(1).optional(),
  phoneNumberId: z.string().min(1).optional(),
  accessToken: z.string().min(10).optional(),
  displayPhoneNumber: z.string().optional(),
  clientId: z.string().min(1, "Client ID is required").optional(),
  clientSecret: z.string().min(10, "Client Secret is required").optional(),
}).refine(
  (v) => (v.wabaId || v.clientId) && (v.accessToken || v.clientSecret),
  { message: "Enter your Client ID and Client Secret to connect." },
);

export async function connectWhatsApp(organizationId: string, userId: string, input: z.infer<typeof connectSchema>) {
  const parsed = connectSchema.parse(input);
  const wabaId = (parsed.wabaId || parsed.clientId || "").trim();
  // Access tokens never contain whitespace — pasted values often carry stray
  // spaces/newlines, so strip them all instead of failing on a good token.
  const accessToken = (parsed.accessToken || parsed.clientSecret || "").replace(/\s+/g, "");
  let phoneNumberId = (parsed.phoneNumberId || "").trim();
  if (!wabaId || accessToken.length < 10) {
    throw new AppError("Enter your Client ID and Client Secret to connect.", "INVALID_INPUT", 400);
  }
  // Catch the two classic wrong-value mistakes BEFORE any Meta call, with a
  // message that names the exact fix:
  // - 32-char hex = Meta "App Secret" (App Settings → Basic). It is NOT an
  //   access token and can never work here.
  // - "xxx|yyy" pipe form = App Token. WhatsApp endpoints need a
  //   user/system-user token instead.
  if (/^[0-9a-f]{32}$/i.test(accessToken)) {
    throw new AppError(
      "That looks like your Meta App Secret — it can't be used to connect. Paste an access token instead (starts with EAA…): WhatsApp → API Setup → temporary token, or a System User token for a permanent connection.",
      "WHATSAPP_APP_SECRET_MISTAKE",
      400,
    );
  }
  if (accessToken.includes("|")) {
    throw new AppError(
      "That looks like a Meta App Token (app_id|secret) — WhatsApp needs a user access token instead (starts with EAA…). Generate one under WhatsApp → API Setup or as a System User token.",
      "WHATSAPP_APP_TOKEN_MISTAKE",
      400,
    );
  }
  // Verify the token is live FIRST, so a dead token reports exactly that —
  // and a good token that fails later unambiguously means wrong ID or
  // missing permissions, never a vague failure.
  await verifyAccessToken(accessToken);
  // No phone id supplied (simplified form): pick the first number on the WABA.
  let discovered: { display_phone_number?: string; verified_name?: string; quality_rating?: string } | null = null;
  if (!phoneNumberId) {
    const numbers = await fetchWabaPhoneNumbers(wabaId, accessToken);
    const first = numbers[0];
    if (!first) {
      throw new AppError(
        "No WhatsApp phone numbers found on this account. Add a phone number to your WhatsApp Business Account in Meta, then try again.",
        "WHATSAPP_NO_NUMBERS",
        404,
      );
    }
    phoneNumberId = first.id;
    discovered = first;
  }
  // A phoneNumberId already owned by ANOTHER workspace must never be
  // reassigned by upsert — reject the takeover attempt.
  const existingNumber = await db.whatsAppPhoneNumber.findUnique({
    where: { phoneNumberId },
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
  const encrypted = encryptSecret(accessToken);
  const lookup = discovered || (await fetchPhoneNumber(phoneNumberId, accessToken));

  const account = await db.whatsAppAccount.upsert({
    where: { organizationId_wabaId: { organizationId, wabaId } },
    update: {
      accessTokenEncrypted: encrypted,
      status: "connected",
      metaAppId: env().META_APP_ID,
    },
    create: {
      organizationId,
      wabaId,
      accessTokenEncrypted: encrypted,
      status: "connected",
      metaAppId: env().META_APP_ID,
    },
  });

  const phone = await db.whatsAppPhoneNumber.upsert({
    where: { phoneNumberId },
    update: {
      organizationId,
      whatsappAccountId: account.id,
      displayPhoneNumber: lookup.display_phone_number || parsed.displayPhoneNumber || phoneNumberId,
      verifiedName: lookup.verified_name,
      qualityRating: lookup.quality_rating,
      isDefault: true,
    },
    create: {
      organizationId,
      whatsappAccountId: account.id,
      phoneNumberId,
      displayPhoneNumber: lookup.display_phone_number || parsed.displayPhoneNumber || phoneNumberId,
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
