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

export async function fetchPhoneNumber(phoneNumberId: string, accessToken: string) {
  const res = await fetch(
    `${GRAPH}/${phoneNumberId}?fields=display_phone_number,verified_name,quality_rating`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  const json = await res.json();
  if (!res.ok) {
    throw new AppError(json.error?.message || "Unable to load WhatsApp phone number", "WHATSAPP_PHONE_LOOKUP", 502);
  }
  return json as {
    display_phone_number?: string;
    verified_name?: string;
    quality_rating?: string;
  };
}
