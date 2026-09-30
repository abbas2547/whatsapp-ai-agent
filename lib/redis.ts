import { isPlaceholder } from "@/lib/env";

type RedisMode = "native" | "upstash-rest" | "none";

let nativeClient: import("ioredis").default | null = null;
let nativeFailed = false;

export function redisMode(): RedisMode {
  const url = (process.env.REDIS_URL || "").trim();
  if (!url || isPlaceholder(url)) return "none";
  if (/^rediss?:\/\//i.test(url)) return "native";
  if (/^https?:\/\//i.test(url)) return "upstash-rest";
  return "none";
}

export function redisToken(): string {
  return (process.env.REDIS_TOKEN || process.env.REDIS_API_KEY || "").trim();
}

function getNativeClient(): import("ioredis").default | null {
  if (nativeFailed) return null;
  if (nativeClient) return nativeClient;
  const url = (process.env.REDIS_URL || "").trim();
  if (!/^rediss?:\/\//i.test(url)) return null;
  try {
    // Lazy-require so Upstash-only installs never pay for ioredis.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const IORedis = require("ioredis") as typeof import("ioredis").default;
    nativeClient = new IORedis(url, {
      lazyConnect: true,
      maxRetriesPerRequest: 2,
      connectTimeout: 8000,
      enableReadyCheck: true,
      // Redis Cloud hosts like *.db.redis.io:15821 sometimes need TLS even on
      // redis:// URLs. Retry with TLS automatically is handled by pingRedis().
      tls: /^rediss:\/\//i.test(url) ? {} : undefined,
    });
    nativeClient.on("error", () => {
      // Swallow background reconnect noise; pingRedis() reports status.
    });
    return nativeClient;
  } catch {
    nativeFailed = true;
    return null;
  }
}

async function pingNative(client: import("ioredis").default): Promise<number> {
  const t0 = Date.now();
  await client.ping();
  return Date.now() - t0;
}

async function pingUpstashRest(): Promise<{ ms: number }> {
  const base = (process.env.REDIS_URL || "").trim().replace(/\/$/, "");
  const token = redisToken();
  if (!token) throw new Error("REDIS_TOKEN (or REDIS_API_KEY) is required for Upstash REST");
  const t0 = Date.now();
  const res = await fetch(`${base}/ping`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Upstash REST ${res.status}`);
  await res.text().catch(() => "");
  return { ms: Date.now() - t0 };
}

/**
 * Real Redis ping. Supports:
 * - native redis:// / rediss:// (Redis Cloud, self-hosted, etc.) via ioredis
 * - https://... Upstash REST via fetch
 * Returns latency so health endpoints can report CONNECTED truthfully.
 */
export async function pingRedis(): Promise<{ ok: boolean; ms: number | null; mode: RedisMode; error?: string }> {
  const mode = redisMode();
  if (mode === "none") return { ok: false, ms: null, mode, error: "Redis not configured" };
  if (mode === "upstash-rest") {
    try {
      const { ms } = await pingUpstashRest();
      return { ok: true, ms, mode };
    } catch (e) {
      return { ok: false, ms: null, mode, error: e instanceof Error ? e.message : "ping failed" };
    }
  }
  // Native: try as-is, then once more with TLS (many managed hosts terminate
  // TLS on the same port and hang without it — the #1 "right URL, no connect").
  const client = getNativeClient();
  if (!client) return { ok: false, ms: null, mode, error: "Redis client unavailable" };
  try {
    const ms = await pingNative(client);
    return { ok: true, ms, mode };
  } catch (first) {
    // TLS retry only when the URL wasn't already rediss://
    const url = (process.env.REDIS_URL || "").trim();
    if (/^redis:\/\//i.test(url)) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const IORedis = require("ioredis") as typeof import("ioredis").default;
        const tlsUrl = url.replace(/^redis:\/\//i, "rediss://");
        const tlsClient = new IORedis(tlsUrl, {
          lazyConnect: true,
          maxRetriesPerRequest: 1,
          connectTimeout: 8000,
          enableReadyCheck: true,
          tls: {},
        });
        const t0 = Date.now();
        await tlsClient.ping();
        const ms = Date.now() - t0;
        await tlsClient.quit().catch(() => undefined);
        return { ok: true, ms, mode };
      } catch {
        // fall through to original error
      }
    }
    await client.quit().catch(() => undefined);
    nativeClient = null;
    return { ok: false, ms: null, mode, error: first instanceof Error ? first.message.slice(0, 200) : "ping failed" };
  }
}

/** Best-effort cache GET — returns null on any failure (never throws). */
export async function cacheGet(key: string): Promise<string | null> {
  try {
    const mode = redisMode();
    if (mode === "native") {
      const c = getNativeClient();
      if (!c) return null;
      return await c.get(key);
    }
    if (mode === "upstash-rest") {
      const base = (process.env.REDIS_URL || "").trim().replace(/\/$/, "");
      const token = redisToken();
      if (!token) return null;
      const res = await fetch(`${base}/get/${encodeURIComponent(key)}`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      if (!res.ok) return null;
      const json = (await res.json()) as { result?: string | null };
      return json.result ?? null;
    }
    return null;
  } catch {
    return null;
  }
}

/** Best-effort cache SETEX — never throws. */
export async function cacheSet(key: string, value: string, ttlSeconds = 300): Promise<void> {
  try {
    const mode = redisMode();
    if (mode === "native") {
      const c = getNativeClient();
      if (!c) return;
      await c.set(key, value, "EX", Math.max(1, ttlSeconds));
      return;
    }
    if (mode === "upstash-rest") {
      const base = (process.env.REDIS_URL || "").trim().replace(/\/$/, "");
      const token = redisToken();
      if (!token) return;
      await fetch(`${base}/set/${encodeURIComponent(key)}/${encodeURIComponent(value)}?ex=${Math.max(1, ttlSeconds)}`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
    }
  } catch {
    // cache must never break the request
  }
}
