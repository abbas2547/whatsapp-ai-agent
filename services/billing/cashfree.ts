import crypto from "crypto";

/**
 * Server-only Cashfree PG client. Never import from client components —
 * secrets (CASHFREE_SECRET_KEY) must never reach the browser.
 *
 * One-time order flow (no fake recurring billing): each monthly/annual
 * purchase is a Cashfree order; a verified PAID order activates the paid
 * period on the local subscription record.
 */

export type CashfreeEnv = "sandbox" | "production";

export interface CashfreeConfig {
  appId: string;
  secretKey: string;
  webhookSecret: string;
  env: CashfreeEnv;
  apiVersion: string;
}

export function cashfreeEnv(): CashfreeEnv {
  return process.env.CASHFREE_ENVIRONMENT === "production" ? "production" : "sandbox";
}

export function getCashfreeConfig(): CashfreeConfig | null {
  const appId = (process.env.CASHFREE_APP_ID || "").trim();
  const secretKey = (process.env.CASHFREE_SECRET_KEY || "").trim();
  if (!appId || !secretKey) return null;
  const webhookSecret = (process.env.CASHFREE_WEBHOOK_SECRET || "").trim() || secretKey;
  return {
    appId,
    secretKey,
    webhookSecret,
    env: cashfreeEnv(),
    apiVersion: (process.env.CASHFREE_API_VERSION || "").trim() || "2023-08-01",
  };
}

export function cashfreeBaseUrl(env: CashfreeEnv): string {
  return env === "production" ? "https://api.cashfree.com/pg" : "https://sandbox.cashfree.com/pg";
}

export class CashfreeError extends Error {
  constructor(
    message: string,
    public status = 502,
    public providerCode?: string,
  ) {
    super(message);
    this.name = "CashfreeError";
  }
}

interface CashfreeApiError {
  message?: string;
  code?: string;
  type?: string;
}

async function cfFetch(
  cfg: CashfreeConfig,
  path: string,
  init: { method: "GET" | "POST"; body?: unknown; requestId?: string },
): Promise<Record<string, unknown>> {
  const res = await fetch(`${cashfreeBaseUrl(cfg.env)}${path}`, {
    method: init.method,
    headers: {
      "Content-Type": "application/json",
      "x-client-id": cfg.appId,
      "x-client-secret": cfg.secretKey,
      "x-api-version": cfg.apiVersion,
      ...(init.requestId ? { "x-request-id": init.requestId } : {}),
    },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
    signal: AbortSignal.timeout(20_000),
  }).catch((e: unknown) => {
    throw new CashfreeError(
      e instanceof Error && e.name === "TimeoutError"
        ? "Payment provider timed out. Please try again."
        : "Could not reach the payment provider. Please try again.",
      502,
    );
  });
  const data = (await res.json().catch(() => null)) as Record<string, unknown> | null;
  if (!res.ok) {
    const err = (data ?? {}) as CashfreeApiError;
    const providerCode = typeof err.code === "string" ? err.code : undefined;
    const providerMessage = typeof err.message === "string" ? err.message : "";
    // Log the real provider reason server-side (safe: no secrets in error
    // bodies) so "declined" is always diagnosable from server logs.
    console.error(
      `[cashfree] ${init.method} ${path} -> HTTP ${res.status}${providerCode ? ` code=${providerCode}` : ""}${providerMessage ? ` message=${providerMessage.slice(0, 300)}` : ""}`,
    );
    if (res.status === 401 || res.status === 403) {
      throw new CashfreeError(
        "Payment provider rejected our credentials. Please contact support.",
        502,
        providerCode,
      );
    }
    throw new CashfreeError(
      mapDeclineMessage(path, res.status, providerCode, providerMessage),
      502,
      providerCode,
    );
  }
  return data ?? {};
}

/**
 * Maps common Cashfree 4xx validation failures to actionable messages.
 * Never includes secrets — only the provider's public code/message.
 */
function mapDeclineMessage(path: string, status: number, code?: string, providerMessage?: string): string {
  const hay = `${code || ""} ${providerMessage || ""}`.toLowerCase();
  if (/customer_phone|phone.*invalid|invalid.*phone/.test(hay)) {
    return "The phone number was rejected by the payment provider. Please enter a valid 10-digit Indian mobile number.";
  }
  if (/order_id.*exist|duplicate.*order|order.*already/.test(hay)) {
    return "This order already exists with the payment provider. Please wait a minute and start checkout again.";
  }
  if (/customer_email|email.*invalid|invalid.*email/.test(hay)) {
    return "The email address was rejected by the payment provider. Please check it and try again.";
  }
  if (/amount|order_amount/.test(hay)) {
    return "The order amount was rejected by the payment provider. Please try again or contact support.";
  }
  if (/return_url|notify_url|order_meta/.test(hay)) {
    return "Payment configuration was rejected by the provider. Please contact support.";
  }
  if (status >= 500) {
    return "Payment provider is having issues right now. Please try again in a moment.";
  }
  return `Payment provider declined the request${code ? ` (${code})` : ""}. Please check your details and try again.`;
}

/**
 * Normalizes a user-entered phone number to the 10-digit Indian mobile
 * format Cashfree requires for INR orders. Accepts "+91…", "91…", "0…" and
 * spaced/dashed input. Throws an AppError-like Error on invalid input.
 */
export function normalizeCustomerPhone(raw: string): string {
  let digits = String(raw || "").replace(/[^\d]/g, "");
  // Strip Indian country-code / trunk prefixes users commonly include.
  if (digits.length === 12 && digits.startsWith("91")) digits = digits.slice(2);
  else if (digits.length === 11 && digits.startsWith("0")) digits = digits.slice(1);
  if (!/^[6-9]\d{9}$/.test(digits)) {
    throw new CashfreeError(
      "Please enter a valid 10-digit Indian mobile number for the payment receipt.",
      400,
    );
  }
  return digits;
}

export interface CreateOrderInput {
  orderId: string;
  amountRupees: number;
  currency: "INR";
  customerId: string;
  customerEmail: string;
  customerPhone: string;
  returnUrl: string;
  notifyUrl: string;
}

export interface CreatedOrder {
  orderId: string;
  paymentSessionId: string;
  orderStatus: string;
}

export async function createCashfreeOrder(cfg: CashfreeConfig, input: CreateOrderInput): Promise<CreatedOrder> {
  const data = await cfFetch(cfg, "/orders", {
    method: "POST",
    requestId: `ord-${input.orderId}-${Date.now()}`,
    body: {
      order_id: input.orderId,
      order_amount: input.amountRupees,
      order_currency: input.currency,
      customer_details: {
        customer_id: input.customerId,
        customer_email: input.customerEmail,
        customer_phone: input.customerPhone,
      },
      order_meta: {
        return_url: input.returnUrl,
        notify_url: input.notifyUrl,
        // NOTE: no `payment_methods` filter — Cashfree validates its values
        // strictly and unknown codes (e.g. "card") make the whole order
        // request fail with a 400. Omitting it shows all merchant-enabled
        // methods (UPI, cards, netbanking, wallets).
      },
    },
  });
  const paymentSessionId = data.payment_session_id;
  if (typeof paymentSessionId !== "string" || !paymentSessionId) {
    throw new CashfreeError("Payment provider did not return a checkout session. Please try again.", 502);
  }
  return {
    orderId: String(data.order_id ?? input.orderId),
    paymentSessionId,
    orderStatus: typeof data.order_status === "string" ? data.order_status : "ACTIVE",
  };
}

export interface CashfreeOrderInfo {
  orderId: string;
  status: string;
  amount: number;
  currency: string;
}

export async function getCashfreeOrder(cfg: CashfreeConfig, orderId: string): Promise<CashfreeOrderInfo> {
  const data = await cfFetch(cfg, `/orders/${encodeURIComponent(orderId)}`, { method: "GET" });
  return {
    orderId: String(data.order_id ?? orderId),
    status: typeof data.order_status === "string" ? data.order_status : "UNKNOWN",
    amount: typeof data.order_amount === "number" ? data.order_amount : NaN,
    currency: typeof data.order_currency === "string" ? data.order_currency : "",
  };
}

export interface CashfreePaymentInfo {
  paymentId: string;
  status: string;
  amount: number;
  currency: string;
  method: string | null;
  paidAt: string | null;
  message: string | null;
}

export async function getCashfreeOrderPayments(
  cfg: CashfreeConfig,
  orderId: string,
): Promise<CashfreePaymentInfo[]> {
  const data = await cfFetch(cfg, `/orders/${encodeURIComponent(orderId)}/payments`, { method: "GET" });
  const list = Array.isArray(data) ? data : [];
  return list
    .filter((p): p is Record<string, unknown> => !!p && typeof p === "object")
    .map((p) => ({
      paymentId: String(p.cf_payment_id ?? p.payment_id ?? ""),
      status: typeof p.payment_status === "string" ? p.payment_status : "UNKNOWN",
      amount: typeof p.payment_amount === "number" ? p.payment_amount : NaN,
      currency: typeof p.payment_currency === "string" ? p.payment_currency : "",
      method:
        p.payment_method && typeof p.payment_method === "object"
          ? String((p.payment_method as Record<string, unknown>).upi ?? (p.payment_method as Record<string, unknown>).card ?? (p.payment_method as Record<string, unknown>).netbanking ?? "") || null
          : typeof p.payment_method === "string"
            ? p.payment_method
            : null,
      paidAt: typeof p.payment_time === "string" ? p.payment_time : null,
      message: typeof p.payment_message === "string" ? p.payment_message : null,
    }))
    .filter((p) => p.paymentId);
}

/**
 * Verify a Cashfree PG webhook signature. MUST be computed over the RAW
 * request body (never parse-then-restringify before verifying).
 * signature = base64(HMAC_SHA256(secret, timestamp + rawBody))
 */
export function verifyCashfreeWebhook(
  webhookSecret: string,
  rawBody: string,
  timestamp: string,
  signature: string,
): boolean {
  if (!webhookSecret || !timestamp || !signature) return false;
  try {
    const expected = crypto.createHmac("sha256", webhookSecret).update(timestamp + rawBody, "utf8").digest("base64");
    const a = Buffer.from(expected);
    const b = Buffer.from(signature);
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

/** Successful terminal payment statuses reported by Cashfree PG. */
export function isSuccessfulPaymentStatus(status: string): boolean {
  return status === "SUCCESS";
}

/** Terminal failure statuses (never auto-retry server-side). */
export function isFailedPaymentStatus(status: string): boolean {
  return ["FAILED", "USER_DROPPED", "VOID", "CANCELLED", "NOT_ATTEMPTED"].includes(status);
}
