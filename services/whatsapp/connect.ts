import { z } from "zod";
import { db } from "@/lib/db";
import { encryptSecret } from "@/lib/encryption";
import { env } from "@/lib/env";
import { AppError, LimitError } from "@/lib/errors";
import { canConnectWhatsAppNumber } from "@/services/billing/entitlements";
import { fetchPhoneNumber, fetchWabaPhoneNumbers, resolveAccessToken, sendWhatsAppMessage, verifyAccessToken } from "@/services/whatsapp/client";
import { writeAuditLog } from "@/services/audit/audit.service";

// Manual 3-credential connect (Meta API Setup values):
// - Access Token — authorizes API calls (starts with EAA…)
// - Phone Number ID — tells Meta which WhatsApp number to send from
// - WABA ID (WhatsApp Business Account ID) — identifies the business account.
// Legacy callers may pass clientId (= WABA ID) / clientSecret (= access token)
// and omit phoneNumberId — the number is then auto-discovered from the WABA.
const connectSchema = z.object({
  wabaId: z.string().min(1).optional(),
  phoneNumberId: z.string().min(1).optional(),
  accessToken: z.string().min(10).optional(),
  displayPhoneNumber: z.string().optional(),
  clientId: z.string().min(1, "WhatsApp Business Account ID is required").optional(),
  clientSecret: z.string().min(10, "Access Token is required").optional(),
}).refine(
  (v) => (v.wabaId || v.clientId) && (v.accessToken || v.clientSecret),
  { message: "Enter your Access Token, Phone Number ID and WhatsApp Business Account ID to connect." },
);

export async function connectWhatsApp(organizationId: string, userId: string, input: z.infer<typeof connectSchema>) {
  const parsed = connectSchema.parse(input);
  const wabaId = (parsed.wabaId || parsed.clientId || "").trim();
  // Access tokens never contain whitespace — pasted values often carry stray
  // spaces/newlines, so strip them all instead of failing on a good token.
  const accessToken = (parsed.accessToken || parsed.clientSecret || "").replace(/\s+/g, "");
  let phoneNumberId = (parsed.phoneNumberId || "").trim();
  if (!wabaId || accessToken.length < 10) {
    throw new AppError("Enter your Access Token, Phone Number ID and WhatsApp Business Account ID to connect.", "INVALID_INPUT", 400);
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
  // All three credentials supplied (normal form): verify each one against
  // Meta and cross-check that the Phone Number ID belongs to the WABA ID.
  // No phone id supplied (legacy 2-field form): pick the first number on
  // the WABA so old callers keep working.
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
  } else {
    // 1) Phone Number ID must be readable with this token.
    let phoneLookup: { display_phone_number?: string; verified_name?: string; quality_rating?: string };
    try {
      phoneLookup = await fetchPhoneNumber(phoneNumberId, accessToken);
    } catch (error) {
      if (error instanceof AppError && (error.code === "WHATSAPP_BAD_TOKEN" || error.code === "WHATSAPP_PERMISSIONS")) throw error;
      throw new AppError(
        "That Phone Number ID couldn't be read with this Access Token. Copy the 'Phone Number ID' from Meta → your app → WhatsApp → API Setup (the number you send from — not the WABA ID or App ID) and make sure the token has the whatsapp_business_messaging permission.",
        "WHATSAPP_BAD_PHONE_ID",
        400,
      );
    }
    // 2) WABA ID must be readable with this token (throws WHATSAPP_BAD_WABA_ID
    // with its own fix-it message when the ID is wrong).
    const numbers = await fetchWabaPhoneNumbers(wabaId, accessToken);
    // 3) The number must belong to this WABA — catches mixed-up credentials
    // from different apps/accounts before anything is stored.
    const match = numbers.find((n) => n.id === phoneNumberId);
    if (!match) {
      throw new AppError(
        "That Phone Number ID doesn't belong to this WhatsApp Business Account ID. Both values must come from the same Meta → app → WhatsApp → API Setup screen (the Send/Receive test panel shows all three together).",
        "WHATSAPP_ID_MISMATCH",
        400,
      );
    }
    discovered = {
      display_phone_number: phoneLookup.display_phone_number || match.display_phone_number,
      verified_name: phoneLookup.verified_name || match.verified_name,
      quality_rating: phoneLookup.quality_rating || match.quality_rating,
    };
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
