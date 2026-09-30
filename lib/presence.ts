import { db } from "@/lib/db";

/** Heartbeat every 45s, ONLINE if seen within 90s. Configurable via env. */
export function presenceThresholdMs(): number {
  const raw = Number(process.env.PRESENCE_ONLINE_THRESHOLD_SEC || "90");
  if (Number.isFinite(raw) && raw >= 30 && raw <= 600) return raw * 1000;
  return 90_000;
}

export function heartbeatThrottleMs(): number {
  return 45_000;
}

export function onlineSinceDate(): Date {
  return new Date(Date.now() - presenceThresholdMs());
}

export function isOnline(lastSeenAt: Date | string | null | undefined, now = Date.now()): boolean {
  if (!lastSeenAt) return false;
  const t = typeof lastSeenAt === "string" ? new Date(lastSeenAt).getTime() : lastSeenAt.getTime();
  if (!Number.isFinite(t)) return false;
  return now - t < presenceThresholdMs();
}

/** Throttled presence touch — at most ~1 DB write per 45s per user. */
export async function touchPresence(userId: string): Promise<void> {
  try {
    const user = await db.user.findUnique({ where: { id: userId }, select: { lastSeenAt: true } });
    const now = Date.now();
    if (user?.lastSeenAt && now - user.lastSeenAt.getTime() < heartbeatThrottleMs()) return;
    await db.user.update({ where: { id: userId }, data: { lastSeenAt: new Date() } });
    // Best-effort session freshness (JWT strategy: no persistent row per token,
    // so we keep the latest UserSession row fresh instead).
    await db.userSession
      .updateMany({ where: { userId, revokedAt: null }, data: { lastSeenAt: new Date() } })
      .catch(() => {});
  } catch {
    // Presence must never break the request.
  }
}

export async function recordLoginEvent(input: {
  userId: string;
  organizationId?: string | null;
  type: "LOGIN" | "LOGOUT" | "REGISTER";
  ip?: string | null;
  userAgent?: string | null;
}) {
  try {
    await db.loginEvent.create({
      data: {
        userId: input.userId,
        organizationId: input.organizationId || undefined,
        type: input.type,
        ip: input.ip?.slice(0, 64),
        userAgent: input.userAgent?.slice(0, 500),
      },
    });
    if (input.type === "LOGIN" || input.type === "REGISTER") {
      await db.user.update({
        where: { id: input.userId },
        data: { lastLoginAt: new Date(), lastSeenAt: new Date() },
      });
    } else if (input.type === "LOGOUT") {
      await db.user.update({ where: { id: input.userId }, data: { lastLogoutAt: new Date() } });
    }
  } catch (e) {
    console.error("[presence] login event failed:", e instanceof Error ? e.message : "unknown");
  }
}

export function parseDeviceLabel(userAgent?: string | null): string {
  if (!userAgent) return "Unknown device";
  const ua = userAgent.toLowerCase();
  const browser = ua.includes("edg") ? "Edge" : ua.includes("chrome") ? "Chrome" : ua.includes("firefox") ? "Firefox" : ua.includes("safari") ? "Safari" : "Browser";
  const os = ua.includes("windows") ? "Windows" : ua.includes("mac") ? "macOS" : ua.includes("android") ? "Android" : ua.includes("iphone") || ua.includes("ipad") ? "iOS" : ua.includes("linux") ? "Linux" : "Unknown OS";
  return `${browser} · ${os}`;
}
