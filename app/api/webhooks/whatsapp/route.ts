import { after, NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { db } from "@/lib/db";
import { getClientIp, rateLimit } from "@/lib/rate-limit";
import { env, whatsappVerifyToken } from "@/lib/env";
import { verifyMetaSignature } from "@/lib/encryption";
import { handleWhatsAppWebhook, type MetaWebhookPayload } from "@/services/whatsapp/webhook";

export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const mode = request.nextUrl.searchParams.get("hub.mode");
  const token = request.nextUrl.searchParams.get("hub.verify_token");
  const challenge = request.nextUrl.searchParams.get("hub.challenge");
  const expected = whatsappVerifyToken();
  const valid =
    !!mode &&
    !!token &&
    !!expected &&
    !!challenge &&
    mode === "subscribe" &&
    token.length === expected.length &&
    timingSafeEqual(Buffer.from(token), Buffer.from(expected));
  if (valid && challenge) {
    // Scope verification to the phone numbers Meta is actually verifying:
    // match by phone_number_id when Meta echoes it, otherwise fall back to
    // marking accounts that are still unverified (never every row blindly).
    const phoneNumberId = request.nextUrl.searchParams.get("hub.phone_number_id");
    after(async () => {
      try {
        if (phoneNumberId) {
          const phone = await db.whatsAppPhoneNumber.findUnique({
            where: { phoneNumberId },
            select: { whatsappAccountId: true },
          });
          if (phone) {
            await db.whatsAppAccount.update({
              where: { id: phone.whatsappAccountId },
              data: { webhookVerified: true },
            });
            return;
          }
        }
        await db.whatsAppAccount.updateMany({
          where: { webhookVerified: false },
          data: { webhookVerified: true },
        });
      } catch {
        // Verification bookkeeping must never fail the challenge response.
      }
    });
    return new NextResponse(challenge, { status: 200 });
  }
  return NextResponse.json({ error: "Verification failed" }, { status: 403 });
}

export async function POST(request: NextRequest) {
  const limited = rateLimit(`wa:${getClientIp(request)}`, 120, 60_000);
  if (!limited.success) {
    return NextResponse.json({ error: "Rate limited" }, { status: 429 });
  }
  // Verify Meta signature over the RAW body before any DB write. Requests
  // without a valid signature are forged — reject before parsing.
  const rawBody = await request.text().catch(() => null);
  if (rawBody === null) return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  try {
    const appSecret = env().META_APP_SECRET || "";
    if (appSecret) {
      const signature = request.headers.get("x-hub-signature-256");
      if (!verifyMetaSignature(appSecret, rawBody, signature)) {
        return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
      }
    }
  } catch {
    // If env is misconfigured, fail open for availability but log server-side.
    console.error("[whatsapp-webhook] signature check skipped: env misconfigured");
  }
  let payload: MetaWebhookPayload | null = null;
  try {
    payload = JSON.parse(rawBody) as MetaWebhookPayload;
  } catch {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }
  if (!payload) return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  await handleWhatsAppWebhook(payload);
  return NextResponse.json({ ok: true });
}
