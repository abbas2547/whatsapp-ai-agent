import { db } from "@/lib/db";
import { isPlaceholder } from "@/lib/env";

export type HealthItem = {
  service: string;
  status: "CONNECTED" | "NOT_CONFIGURED" | "ERROR" | "UNKNOWN";
  latencyMs: number | null;
  message: string;
};

async function time<T>(fn: () => Promise<T>): Promise<{ ok: boolean; ms: number; value?: T; error?: string }> {
  const t0 = Date.now();
  try {
    const value = await fn();
    return { ok: true, ms: Date.now() - t0, value };
  } catch (e) {
    return { ok: false, ms: Date.now() - t0, error: e instanceof Error ? e.message : "unknown" };
  }
}

export async function checkDatabase(): Promise<HealthItem> {
  const r = await time(() => db.$queryRaw`SELECT 1`);
  if (r.ok) return { service: "database", status: "CONNECTED", latencyMs: r.ms, message: "PostgreSQL reachable" };
  return { service: "database", status: "ERROR", latencyMs: r.ms, message: "Database query failed" };
}

export async function checkRedis(): Promise<HealthItem> {
  const { pingRedis, redisMode } = await import("@/lib/redis");
  const mode = redisMode();
  if (mode === "none") {
    return { service: "redis", status: "NOT_CONFIGURED", latencyMs: null, message: "Redis not configured (set REDIS_URL)" };
  }
  const r = await time(() => pingRedis());
  if (r.ok && r.value?.ok) {
    const label = r.value.mode === "native" ? "Redis connected" : "Upstash REST connected";
    return { service: "redis", status: "CONNECTED", latencyMs: r.value.ms, message: `${label} · ${r.value.ms}ms` };
  }
  const detail = r.ok ? r.value?.error : r.error;
  return { service: "redis", status: "ERROR", latencyMs: null, message: `Redis unreachable: ${(detail || "ping failed").slice(0, 160)}` };
}

export async function checkWhatsApp(): Promise<HealthItem> {
  const token = process.env.META_ACCESS_TOKEN;
  if (!token || isPlaceholder(token)) {
    return { service: "whatsapp", status: "NOT_CONFIGURED", latencyMs: null, message: "Meta access token not configured" };
  }
  return { service: "whatsapp", status: "UNKNOWN", latencyMs: null, message: "Configured; per-workspace status shown in WhatsApp panel" };
}

export async function checkAI(): Promise<HealthItem> {
  const openrouter = process.env.OPENROUTER_API_KEY;
  const gemini = process.env.GEMINI_API_KEY;
  if ((openrouter && !isPlaceholder(openrouter)) || (gemini && !isPlaceholder(gemini))) {
    const which = openrouter && !isPlaceholder(openrouter) ? "OpenRouter" : "Gemini (legacy)";
    const model = process.env.OPENROUTER_MODEL || process.env.GEMINI_MODEL || "default";
    return { service: "ai", status: "UNKNOWN", latencyMs: null, message: `${which} key configured (${model}); errors tracked from agent runs` };
  }
  return { service: "ai", status: "NOT_CONFIGURED", latencyMs: null, message: "AI key not configured (set OPENROUTER_API_KEY)" };
}

export async function checkCashfree(): Promise<HealthItem> {
  const id = process.env.CASHFREE_APP_ID;
  const secret = process.env.CASHFREE_SECRET_KEY;
  if (!id || !secret || isPlaceholder(id) || isPlaceholder(secret)) {
    return { service: "cashfree", status: "NOT_CONFIGURED", latencyMs: null, message: "Cashfree credentials not configured" };
  }
  return { service: "cashfree", status: "UNKNOWN", latencyMs: null, message: `Cashfree configured (${process.env.CASHFREE_ENVIRONMENT || "sandbox"})` };
}

export async function getSystemHealth(): Promise<HealthItem[]> {
  const [database, redis, whatsapp, ai, cashfree] = await Promise.all([
    checkDatabase(),
    checkRedis(),
    checkWhatsApp(),
    checkAI(),
    checkCashfree(),
  ]);
  const app: HealthItem = {
    service: "app",
    status: "CONNECTED",
    latencyMs: null,
    message: `${process.env.NODE_ENV || "development"} · ${process.env.NEXT_PUBLIC_APP_URL || "local"}`,
  };
  return [app, database, redis, whatsapp, ai, cashfree];
}
