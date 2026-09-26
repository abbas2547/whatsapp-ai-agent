type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

// Periodically drop expired buckets so a long-lived server never leaks memory.
// Runs at most once per minute; safe on serverless (each instance has its own map).
let lastSweep = 0;
function sweep(now: number) {
  if (now - lastSweep < 60_000) return;
  lastSweep = now;
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt < now) buckets.delete(key);
  }
  // Hard cap: if still huge (abuse with random keys), drop oldest entries.
  if (buckets.size > 10_000) {
    const excess = buckets.size - 10_000;
    const it = buckets.keys();
    for (let i = 0; i < excess; i++) {
      const k = it.next().value;
      if (k === undefined) break;
      buckets.delete(k);
    }
  }
}

export function rateLimit(key: string, limit: number, windowMs: number) {
  const now = Date.now();
  sweep(now);
  const current = buckets.get(key);
  if (!current || current.resetAt < now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { success: true, remaining: limit - 1 };
  }
  if (current.count >= limit) {
    return { success: false, remaining: 0, retryAt: current.resetAt };
  }
  current.count += 1;
  return { success: true, remaining: limit - current.count };
}

/**
 * Best-effort client IP for rate-limit keys. Reads x-forwarded-for (first
 * entry) set by the hosting proxy, falling back to x-real-ip. Spoofable when
 * the app is exposed directly, so security-critical limits must ALSO key on
 * the account identifier (email / userId), never on IP alone.
 */
export function getClientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first.slice(0, 64);
  }
  const real = request.headers.get("x-real-ip")?.trim();
  if (real) return real.slice(0, 64);
  return "unknown";
}
