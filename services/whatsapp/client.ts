import { env, isPlaceholder } from "@/lib/env";
import { decryptSecret } from "@/lib/encryption";
import { AppError } from "@/lib/errors";

const GRAPH = "https://graph.facebook.com/v21.0";

export type WhatsAppSendInput = {
  phoneNumberId: string;
  accessToken: string;
  to: string;
  type: "text" | "image" | "document" | "video" | "audio" | "interactive" | "template";
  text?: string;
  mediaId?: string;
  mediaLink?: string;
  caption?: string;
  filename?: string;
  interactive?: Record<string, unknown>;
  template?: Record<string, unknown>;
};

export function resolveAccessToken(encrypted?: string | null) {
  if (encrypted) return decryptSecret(encrypted);
  const fallback = env().META_ACCESS_TOKEN;
  if (!isPlaceholder(fallback)) return fallback!;
  throw new AppError("WhatsApp is not connected. Add a Meta access token in Integrations.", "WHATSAPP_NOT_CONNECTED", 400);
}

export async function sendWhatsAppMessage(input: WhatsAppSendInput) {
  const body: Record<string, unknown> = {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: input.to.replace(/[^\d]/g, ""),
    type: input.type,
  };

  if (input.type === "text") {
    body.text = { preview_url: false, body: input.text || "" };
  } else if (input.type === "interactive") {
    body.interactive = input.interactive;
  } else if (input.type === "template") {
    body.template = input.template;
  } else {
    const media: Record<string, unknown> = {};
    if (input.mediaId) media.id = input.mediaId;
    if (input.mediaLink) media.link = input.mediaLink;
    if (input.caption) media.caption = input.caption;
    if (input.filename) media.filename = input.filename;
    body[input.type] = media;
  }

  const res = await fetch(`${GRAPH}/${input.phoneNumberId}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${input.accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const json = (await res.json()) as { error?: { message?: string }; messages?: { id: string }[] };
  if (!res.ok) {
    throw new AppError(json.error?.message || "Failed to send WhatsApp message", "WHATSAPP_SEND_FAILED", 502);
  }
  return json.messages?.[0]?.id;
}

export async function markWhatsAppRead(phoneNumberId: string, accessToken: string, messageId: string) {
  await fetch(`${GRAPH}/${phoneNumberId}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      status: "read",
      message_id: messageId,
    }),
  });
}

/**
 * Maps Meta Graph API failures to plain-English, actionable errors. Meta's
 * raw messages (e.g. "(#100) Tried accessing nonexisting field
 * (phone_numbers)") only make sense to API developers, so translate the
 * common cases: wrong ID pasted as Client ID, bad/expired token, missing
 * WhatsApp permissions on the token.
 */
function whatsAppApiError(json: unknown, status: number, fallback: string): AppError {
  const err = (json as { error?: { message?: string; code?: number } } | null)?.error;
  const message = typeof err?.message === "string" ? err.message : "";
  const code = err?.code;
  // Log the raw provider reason server-side for support diagnosis.
  console.error(
    `[whatsapp] Graph API error HTTP ${status}${code ? ` code=${code}` : ""}: ${message.slice(0, 300) || fallback}`,
  );
  if (code === 100 && /nonexisting field/i.test(message)) {
    return new AppError(
      "That Client ID isn't a WhatsApp Business Account (or the token can't access it). Copy the 'WhatsApp Business Account ID' from Meta → your app → WhatsApp → API Setup — not the App ID or Phone Number ID — and make sure the token has the whatsapp_business_management permission.",
      "WHATSAPP_BAD_WABA_ID",
      400,
    );
  }
  if (code === 190 || /invalid oauth|session.*expir|invalid.*token|expired.*token/i.test(message)) {
    return new AppError(
      "Your Client Secret (access token) is invalid or expired. Generate a new token in Meta and try again.",
      "WHATSAPP_BAD_TOKEN",
      400,
    );
  }
  if (/permission|not authorized|scope|requires.*manag/i.test(message)) {
    return new AppError(
      "Your token is missing WhatsApp permissions. It needs whatsapp_business_management and whatsapp_business_messaging — create a System User token with both in Meta Business Settings.",
      "WHATSAPP_PERMISSIONS",
      403,
    );
  }
  return new AppError(message || fallback, "WHATSAPP_API_ERROR", 502);
}

export async function fetchPhoneNumber(phoneNumberId: string, accessToken: string) {
  const res = await fetch(
    `${GRAPH}/${phoneNumberId}?fields=display_phone_number,verified_name,quality_rating`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  const json = await res.json();
  if (!res.ok) {
    throw whatsAppApiError(json, res.status, "Unable to load WhatsApp phone number");
  }
  return json as {
    display_phone_number?: string;
    verified_name?: string;
    quality_rating?: string;
  };
}

export type WabaPhone = {
  id: string;
  display_phone_number?: string;
  verified_name?: string;
  quality_rating?: string;
};

/**
 * Lists phone numbers on a WhatsApp Business Account so callers only need the
 * WABA id (Client ID) + access token (Client Secret) — no manual Phone ID.
 */
export async function fetchWabaPhoneNumbers(wabaId: string, accessToken: string): Promise<WabaPhone[]> {
  const res = await fetch(
    `${GRAPH}/${encodeURIComponent(wabaId)}/phone_numbers?fields=id,display_phone_number,verified_name,quality_rating&limit=25`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  const json = (await res.json()) as {
    error?: { message?: string };
    data?: WabaPhone[];
  };
  if (!res.ok) {
    throw whatsAppApiError(
      json,
      res.status,
      "Couldn't find WhatsApp numbers for this Client ID. Check the ID and Secret, then try again.",
    );
  }
  return json.data || [];
}
