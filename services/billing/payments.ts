import { randomBytes } from "crypto";
import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { appUrl } from "@/lib/env";
import { writeAuditLog } from "@/services/audit/audit.service";
import {
  getPlan,
  planPricePaise,
  paiseToRupees,
  isBillingInterval,
  PLAN_RANK,
  type BillingInterval,
  type PlanId,
} from "@/services/billing/plans";
import {
  getCashfreeConfig,
  createCashfreeOrder,
  getCashfreeOrder,
  getCashfreeOrderPayments,
  isSuccessfulPaymentStatus,
  isFailedPaymentStatus,
  normalizeCustomerPhone,
  type CashfreeConfig,
} from "@/services/billing/cashfree";

export const PROVIDER = "cashfree";

/** Internal reference, e.g. PAY-20260925-A1B2C3. Safe for support/debugging. */
export function newPaymentReference(date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `PAY-${y}${m}${d}-${randomBytes(3).toString("hex").toUpperCase()}`;
}

function requireCashfree(): CashfreeConfig {
  const cfg = getCashfreeConfig();
  if (!cfg) {
    throw new AppError(
      "Payments are not configured yet. Please contact the administrator.",
      "PAYMENTS_NOT_CONFIGURED",
      503,
    );
  }
  return cfg;
}

function sanitizePayload(value: unknown): unknown {
  // Strip anything secret-looking before persisting provider payloads.
  if (!value || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(sanitizePayload);
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (/secret|signature|token|authorization|card|cvv/i.test(k)) continue;
    out[k] = sanitizePayload(v);
  }
  return out;
}

export interface CreateOrderResult {
  configured: true;
  reference: string;
  orderId: string;
  paymentSessionId: string;
  amountPaise: number;
  currency: "INR";
  environment: "sandbox" | "production";
  planId: PlanId;
  interval: BillingInterval;
}

export async function createBillingOrder(input: {
  organizationId: string;
  userId: string;
  userEmail: string;
  planId: string;
  interval: unknown;
  customerPhone: string;
}): Promise<CreateOrderResult> {
  const cfg = requireCashfree();
  const plan = getPlan(input.planId);
  if (!plan || plan.id === "free") throw new AppError("Please choose a valid paid plan.", "INVALID_PLAN", 400);
  if (!isBillingInterval(input.interval)) throw new AppError("Please choose monthly or annual billing.", "INVALID_INTERVAL", 400);
  const interval = input.interval;
  // Cashfree INR orders require a 10-digit Indian mobile number — normalize
  // "+91…"/"91…"/"0…" prefixes here so provider validation never fails.
  let phone: string;
  try {
    phone = normalizeCustomerPhone(input.customerPhone);
  } catch (e) {
    throw new AppError(
      e instanceof Error ? e.message : "Please enter a valid phone number for the payment receipt.",
      "INVALID_PHONE",
      400,
    );
  }

  // Server-side price authority — client amount is never accepted.
  const amountPaise = planPricePaise(plan, interval);

  // Every checkout creates a FRESH order with a unique reference. Re-POSTing
  // an existing order_id to Cashfree is rejected by the provider ("order
  // already exists"), so stale PENDING rows are simply left to expire —
  // only a verified SUCCESS ever activates a subscription.

  const reference = newPaymentReference();
  // Cashfree order_id doubles as our reference: safe charset, unique, joinable.
  const returnUrl = `${appUrl()}/billing/success`;
  const notifyUrl = `${appUrl()}/api/webhooks/cashfree`;
  // Cashfree renders "Broken Link / domain not enabled or approved" when
  // these URLs' domain isn't whitelisted + APPROVED in the SAME dashboard
  // mode (Test vs Production) as CASHFREE_ENVIRONMENT. Log the exact URLs so
  // support can compare them character-for-character with the dashboard entry.
  console.log(`[billing] checkout order ${reference}: env=${cfg.env} return=${returnUrl} notify=${notifyUrl}`);
  if (cfg.env === "production" && (!returnUrl.startsWith("https://") || !notifyUrl.startsWith("https://"))) {
    throw new AppError(
      "Payment return URLs must be https in production. Set NEXT_PUBLIC_APP_URL to your https domain.",
      "INVALID_APP_URL",
      500,
    );
  }
  const payment = await db.payment.create({
    data: {
      organizationId: input.organizationId,
      reference,
      provider: PROVIDER,
      providerOrderId: reference,
      planId: plan.id,
      billingInterval: interval,
      amountPaise,
      currency: "INR",
      status: "PENDING",
      customerEmail: input.userEmail,
      customerPhone: phone,
    },
  });

  await writeAuditLog({
    organizationId: input.organizationId,
    userId: input.userId,
    action: "ORDER_CREATED",
    entityType: "payment",
    entityId: payment.id,
    metadata: { provider: PROVIDER, reference, plan: plan.id, interval },
  });

  const order = await createCashfreeOrder(cfg, {
    orderId: reference,
    amountRupees: paiseToRupees(amountPaise),
    currency: "INR",
    customerId: input.organizationId,
    customerEmail: input.userEmail,
    customerPhone: phone,
    returnUrl,
    notifyUrl,
  }).catch(async (e: unknown) => {
    await db.payment.update({ where: { id: payment.id }, data: { status: "FAILED" } }).catch(() => undefined);
    // Keep the provider's reason in the audit trail for support diagnosis.
    await writeAuditLog({
      organizationId: input.organizationId,
      userId: input.userId,
      action: "CHECKOUT_FAILED",
      entityType: "payment",
      entityId: payment.id,
      metadata: {
        provider: PROVIDER,
        reference,
        reason: e instanceof Error ? e.message.slice(0, 300) : "unknown",
      },
    }).catch(() => undefined);
    throw e;
  });

  await writeAuditLog({
    organizationId: input.organizationId,
    userId: input.userId,
    action: "CHECKOUT_STARTED",
    entityType: "payment",
    entityId: payment.id,
    metadata: { provider: PROVIDER, reference },
  });

  return {
    configured: true,
    reference,
    orderId: order.orderId,
    paymentSessionId: order.paymentSessionId,
    amountPaise,
    currency: "INR",
    environment: cfg.env,
    planId: plan.id,
    interval,
  };
}

export type VerifiedState =
  | { state: "SUCCESS"; planId: PlanId; interval: BillingInterval }
  | { state: "PENDING" | "PROCESSING" }
  | { state: "FAILED" | "CANCELED" | "EXPIRED"; reason?: string };

/**
 * Verify an order against Cashfree (server-side truth), sync local records,
 * and activate the subscription ONLY on verified success. Never trusts the
 * return URL alone. Never downgrades an existing active subscription on a
 * failed new attempt.
 */
export async function verifyAndSyncOrder(input: {
  organizationId: string;
  userId?: string | null;
  orderId: string;
}): Promise<VerifiedState & { reference: string; amountPaise: number }> {
  const payment = await db.payment.findFirst({
    where: { organizationId: input.organizationId, providerOrderId: input.orderId, provider: PROVIDER },
  });
  if (!payment) throw new AppError("Order not found for this workspace.", "ORDER_NOT_FOUND", 404);

  const plan = getPlan(payment.planId);
  if (!plan) throw new AppError("Unknown plan on this order.", "INVALID_PLAN", 400);

  // Already settled locally — report truth without re-calling the provider.
  if (payment.status === "SUCCESS") {
    return {
      state: "SUCCESS",
      reference: payment.reference,
      amountPaise: payment.amountPaise,
      planId: payment.planId as PlanId,
      interval: payment.billingInterval as BillingInterval,
    };
  }
  if (payment.status === "FAILED" || payment.status === "CANCELED" || payment.status === "EXPIRED") {
    return { state: payment.status, reference: payment.reference, amountPaise: payment.amountPaise };
  }

  const cfg = requireCashfree();
  const [orderInfo, payments] = await Promise.all([
    getCashfreeOrder(cfg, payment.providerOrderId),
    getCashfreeOrderPayments(cfg, payment.providerOrderId).catch(() => []),
  ]);

  // Amount/currency guard: provider must agree with our server-side price.
  const expectedRupees = paiseToRupees(payment.amountPaise);
  if (
    Number.isFinite(orderInfo.amount) &&
    (Math.abs(orderInfo.amount - expectedRupees) > 0.001 || (orderInfo.currency && orderInfo.currency !== "INR"))
  ) {
    await db.payment.update({ where: { id: payment.id }, data: { status: "FAILED" } });
    await writeAuditLog({
      organizationId: input.organizationId,
      userId: input.userId,
      action: "PAYMENT_FAILED",
      entityType: "payment",
      entityId: payment.id,
      metadata: { provider: PROVIDER, reference: payment.reference, reason: "amount_mismatch" },
    });
    return { state: "FAILED", reference: payment.reference, amountPaise: payment.amountPaise, reason: "Amount mismatch" };
  }

  const latest = [...payments].reverse().find((p) => p.paymentId) ?? payments[0];
  if (latest && isSuccessfulPaymentStatus(latest.status)) {
    await applySuccessfulPayment({
      organizationId: input.organizationId,
      userId: input.userId,
      paymentId: payment.id,
      providerPaymentId: latest.paymentId,
      paymentMethod: latest.method,
      rawPayload: { order: orderInfo, payment: latest },
    });
    return {
      state: "SUCCESS",
      reference: payment.reference,
      amountPaise: payment.amountPaise,
      planId: payment.planId as PlanId,
      interval: payment.billingInterval as BillingInterval,
    };
  }
  if (latest && isFailedPaymentStatus(latest.status)) {
    const mapped = latest.status === "USER_DROPPED" ? "CANCELED" : "FAILED";
    await db.payment.update({
      where: { id: payment.id },
      data: {
        status: mapped as "FAILED" | "CANCELED",
        providerPaymentId: latest.paymentId,
        paymentMethod: latest.method,
        rawPayload: sanitizePayload({ payment: latest }) as never,
      },
    });
    await writeAuditLog({
      organizationId: input.organizationId,
      userId: input.userId,
      action: "PAYMENT_FAILED",
      entityType: "payment",
      entityId: payment.id,
      metadata: { provider: PROVIDER, reference: payment.reference, providerStatus: latest.status },
    });
    return { state: mapped, reference: payment.reference, amountPaise: payment.amountPaise };
  }
  if (orderInfo.status === "EXPIRED") {
    await db.payment.update({ where: { id: payment.id }, data: { status: "EXPIRED" } });
    return { state: "EXPIRED", reference: payment.reference, amountPaise: payment.amountPaise };
  }
  if (orderInfo.status === "PAID" || latest) {
    await db.payment.update({ where: { id: payment.id }, data: { status: "PROCESSING" } });
    return { state: "PROCESSING", reference: payment.reference, amountPaise: payment.amountPaise };
  }
  return { state: "PENDING", reference: payment.reference, amountPaise: payment.amountPaise };
}

/** Idempotent success application: same call twice → same final state. */
export async function applySuccessfulPayment(input: {
  organizationId: string;
  userId?: string | null;
  paymentId: string;
  providerPaymentId: string;
  paymentMethod: string | null;
  rawPayload: unknown;
}): Promise<void> {
  const payment = await db.payment.findFirst({
    where: { id: input.paymentId, organizationId: input.organizationId },
  });
  if (!payment) throw new AppError("Payment not found.", "PAYMENT_NOT_FOUND", 404);
  if (payment.status === "SUCCESS") return; // already applied — idempotent

  const plan = getPlan(payment.planId);
  if (!plan || plan.id === "free") throw new AppError("Invalid plan on payment.", "INVALID_PLAN", 400);
  const interval: BillingInterval = payment.billingInterval === "annual" ? "annual" : "monthly";
  const period = periodFor(interval);
  const hadPaidPlan = await db.subscription.findUnique({
    where: { organizationId: input.organizationId },
    select: { id: true, planId: true, status: true },
  });
  const isUpgrade = !!hadPaidPlan && hadPaidPlan.planId !== "free" && hadPaidPlan.planId !== plan.id;

  await db.$transaction(async (tx) => {
    await tx.payment.update({
      where: { id: payment.id },
      data: {
        status: "SUCCESS",
        providerPaymentId: input.providerPaymentId,
        paymentMethod: input.paymentMethod,
        rawPayload: sanitizePayload(input.rawPayload) as never,
      },
    });
    const existing = await tx.subscription.findUnique({ where: { organizationId: input.organizationId } });
    if (existing) {
      await tx.subscription.update({
        where: { organizationId: input.organizationId },
        data: {
          planId: plan.id,
          provider: PROVIDER,
          providerOrderId: payment.providerOrderId,
          billingInterval: interval,
          status: "ACTIVE",
          currentPeriodStart: period.start,
          currentPeriodEnd: period.end,
          cancelAtPeriodEnd: false,
        },
      });
    } else {
      await tx.subscription.create({
        data: {
          organizationId: input.organizationId,
          planId: plan.id,
          provider: PROVIDER,
          providerOrderId: payment.providerOrderId,
          billingInterval: interval,
          status: "ACTIVE",
          currentPeriodStart: period.start,
          currentPeriodEnd: period.end,
        },
      });
    }
  });

  const sub = await db.subscription.findUnique({ where: { organizationId: input.organizationId } });
  if (sub) {
    await db.payment.update({ where: { id: payment.id }, data: { subscriptionId: sub.id } }).catch(() => undefined);
  }

  await writeAuditLog({
    organizationId: input.organizationId,
    userId: input.userId,
    action: "PAYMENT_SUCCESS",
    entityType: "payment",
    entityId: payment.id,
    metadata: { provider: PROVIDER, reference: payment.reference, plan: plan.id, interval },
  });
  await writeAuditLog({
    organizationId: input.organizationId,
    userId: input.userId,
    action: isUpgrade ? "PLAN_CHANGED" : "SUBSCRIPTION_ACTIVATED",
    entityType: "subscription",
    entityId: sub?.id,
    metadata: { provider: PROVIDER, plan: plan.id, interval, reference: payment.reference },
  });
}

function periodFor(interval: BillingInterval, from = new Date()): { start: Date; end: Date } {
  const start = new Date(from);
  const end = new Date(from);
  if (interval === "annual") end.setFullYear(end.getFullYear() + 1);
  else end.setMonth(end.getMonth() + 1);
  return { start, end };
}

export async function cancelSubscription(input: { organizationId: string; userId: string }): Promise<void> {
  const sub = await db.subscription.findUnique({ where: { organizationId: input.organizationId } });
  if (!sub || sub.status !== "ACTIVE") throw new AppError("No active subscription to cancel.", "NO_ACTIVE_SUBSCRIPTION", 400);
  // One-time purchase model: no auto-renew exists server-side. Cancel marks
  // the subscription so it lapses to Free at period end — never immediately.
  await db.subscription.update({
    where: { organizationId: input.organizationId },
    data: { cancelAtPeriodEnd: true },
  });
  await writeAuditLog({
    organizationId: input.organizationId,
    userId: input.userId,
    action: "SUBSCRIPTION_CANCELED",
    entityType: "subscription",
    entityId: sub.id,
    metadata: { provider: PROVIDER, plan: sub.planId, lapsesAt: sub.currentPeriodEnd },
  });
}

/**
 * Process a verified Cashfree webhook payload. Fully idempotent via
 * PaymentEvent(provider, eventId) — duplicates return the same outcome.
 */
export async function processCashfreeWebhookEvent(input: {
  eventId: string;
  eventType: string;
  orderId: string | null;
  payload: unknown;
}): Promise<{ outcome: "applied" | "duplicate" | "ignored" }> {
  const eventType = input.eventType || "unknown";
  let eventRow;
  try {
    eventRow = await db.paymentEvent.create({
      data: {
        provider: PROVIDER,
        eventId: input.eventId,
        eventType,
        providerOrderId: input.orderId,
        payload: sanitizePayload(input.payload) as never,
      },
    });
  } catch (e) {
    if ((e as { code?: string })?.code === "P2002") return { outcome: "duplicate" };
    throw e;
  }

  try {
    if (!input.orderId) return { outcome: "ignored" };
    const payment = await db.payment.findUnique({ where: { providerOrderId: input.orderId } });
    if (!payment) return { outcome: "ignored" };

    await writeAuditLog({
      organizationId: payment.organizationId,
      userId: null,
      action: "WEBHOOK_RECEIVED",
      entityType: "payment",
      entityId: payment.id,
      metadata: { provider: PROVIDER, eventType, reference: payment.reference },
    });

    const type = eventType.toUpperCase();
    const isSuccess = type.includes("PAYMENT_SUCCESS") || type.includes("PAYMENT.SUCCESS") || type === "PAYMENT_SUCCESS_WEBHOOK";
    const isFailed = type.includes("PAYMENT_FAILED") || type.includes("PAYMENT.USER_DROPPED") || type.includes("FAILED");

    // Extract provider payment id when present.
    const p = input.payload as Record<string, unknown> | null;
    const data = (p?.data ?? p ?? {}) as Record<string, unknown>;
    const order = (data.order ?? {}) as Record<string, unknown>;
    const pay = (data.payment ?? data ?? {}) as Record<string, unknown>;
    const providerPaymentId =
      [pay.cf_payment_id, pay.payment_id, order.cf_payment_id].find((v) => typeof v === "string" && v) as string | undefined;

    if (isSuccess) {
      if (payment.status !== "SUCCESS") {
        await applySuccessfulPayment({
          organizationId: payment.organizationId,
          userId: null,
          paymentId: payment.id,
          providerPaymentId: providerPaymentId ?? `webhook-${input.eventId}`,
          paymentMethod: typeof pay.payment_method === "string" ? (pay.payment_method as string) : null,
          rawPayload: { webhookEvent: input.eventId, data },
        });
      }
    } else if (isFailed) {
      if (payment.status === "PENDING" || payment.status === "PROCESSING") {
        await db.payment.update({
          where: { id: payment.id },
          data: {
            status: /DROPPED|CANCEL/.test(type) ? "CANCELED" : "FAILED",
            providerPaymentId,
            rawPayload: sanitizePayload({ webhookEvent: input.eventId }) as never,
          },
        });
        await writeAuditLog({
          organizationId: payment.organizationId,
          userId: null,
          action: "PAYMENT_FAILED",
          entityType: "payment",
          entityId: payment.id,
          metadata: { provider: PROVIDER, reference: payment.reference, via: "webhook", eventType },
        });
      }
    }
    // Unknown event types: acknowledged, no state change.

    await db.paymentEvent.update({ where: { id: eventRow.id }, data: { processedAt: new Date(), organizationId: payment.organizationId } });
    return { outcome: "applied" };
  } catch (e) {
    await db.paymentEvent.update({ where: { id: eventRow.id }, data: { processedAt: new Date() } }).catch(() => undefined);
    throw e;
  }
}

/** Rank helper for upgrade/downgrade CTA logic. */
export function comparePlans(current: PlanId, target: PlanId): "same" | "upgrade" | "downgrade" {
  if (current === target) return "same";
  return (PLAN_RANK[target] ?? 0) > (PLAN_RANK[current] ?? 0) ? "upgrade" : "downgrade";
}
