import { after, NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { rateLimit } from "@/lib/rate-limit";
import { whatsappVerifyToken } from "@/lib/env";
import { handleWhatsAppWebhook, type MetaWebhookPayload } from "@/services/whatsapp/webhook";

export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const mode = request.nextUrl.searchParams.get("hub.mode");
  const token = request.nextUrl.searchParams.get("hub.verify_token");
  const challenge = request.nextUrl.searchParams.get("hub.challenge");
  const expected = whatsappVerifyToken();
  if (mode === "subscribe" && token && expected && token === expected && challenge) {
    after(async () => {
      await db.whatsAppAccount.updateMany({ data: { webhookVerified: true } });
    });
    return new NextResponse(challenge, { status: 200 });
  }
  return NextResponse.json({ error: "Verification failed" }, { status: 403 });
}

export async function POST(request: NextRequest) {
  const limited = rateLimit(`wa:${request.headers.get("x-forwarded-for") || "local"}`, 120, 60_000);
  if (!limited.success) {
    return NextResponse.json({ error: "Rate limited" }, { status: 429 });
  }
  const payload = (await request.json().catch(() => null)) as MetaWebhookPayload | null;
  if (!payload) return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  await handleWhatsAppWebhook(payload);
  return NextResponse.json({ ok: true });
}
