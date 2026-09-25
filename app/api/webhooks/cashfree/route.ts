import { NextResponse } from "next/server";
import { rateLimit } from "@/lib/rate-limit";
import {
  getCashfreeConfig,
  verifyCashfreeWebhook,
} from "@/services/billing/cashfree";
import { processCashfreeWebhookEvent } from "@/services/billing/payments";

export const maxDuration = 30;

/**
 * Cashfree PG webhook receiver.
 *
 * Security order (critical):
 *  1. read RAW body — never parse/stringify before verifying
 *  2. verify HMAC signature with timing-safe compare
 *  3. only then parse + process (idempotently)
 */
export async function POST(request: Request) {
  const limited = rateLimit(`cfwh:${request.headers.get("x-forwarded-for") || "local"}`, 120, 60_000);
  if (!limited.success) return NextResponse.json({ error: "Rate limited" }, { status: 429 });

  const cfg = getCashfreeConfig();
  if (!cfg) {
    // Config missing: acknowledge to stop provider retries piling up, but
    // record nothing. This is logged server-side only.
    console.error("[cashfree-webhook] received but payments not configured");
    return NextResponse.json({ ok: true, ignored: "not_configured" });
  }

  const rawBody = await request.text().catch(() => null);
  const signature = request.headers.get("x-webhook-signature") || "";
  const timestamp = request.headers.get("x-webhook-timestamp") || "";
  if (rawBody === null || !verifyCashfreeWebhook(cfg.webhookSecret, rawBody, timestamp, signature)) {
    // Rejected before any DB touch. Durable per-order audit happens inside
    // processCashfreeWebhookEvent once the org is known.
    console.error("[cashfree-webhook] rejected: invalid signature");
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(rawBody) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // Cashfree PG event shape: { type, event_time, data: { order: {...}, payment: {...} } }
  const eventType = typeof payload.type === "string" ? payload.type : "unknown";
  const data = (payload.data ?? {}) as Record<string, unknown>;
  const order = (data.order ?? {}) as Record<string, unknown>;
  const eventId =
    [payload.event_id, payload.id, (data as Record<string, unknown>).event_id]
      .find((v) => typeof v === "string" && v) ?? `${eventType}:${Date.now()}`;
  const orderId =
    [order.order_id, data.order_id, payload.order_id].find((v) => typeof v === "string" && v) ?? null;

  try {
    const result = await processCashfreeWebhookEvent({
      eventId: String(eventId),
      eventType,
      orderId: orderId ? String(orderId) : null,
      payload,
    });
    return NextResponse.json({ ok: true, outcome: result.outcome });
  } catch (error) {
    // 500 → Cashfree retries; idempotency key makes retries safe.
    console.error("[cashfree-webhook] processing failed:", error instanceof Error ? error.message : "unknown");
    return NextResponse.json({ error: "Processing failed" }, { status: 500 });
  }
}
