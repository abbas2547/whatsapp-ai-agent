import { auth } from "@/auth";
import { db } from "@/lib/db";
import { UnauthorizedError } from "@/lib/errors";

/**
 * App-layer session revocation.
 *
 * Auth.js uses stateless JWTs, and its v5 `jwt` callback must never return
 * null (it throws JWTSessionError instead of signing out). So revocation is
 * enforced here, at the gates every request passes through:
 * - requireSessionOrRedirect() (all app pages)
 * - getOrgContext() (all workspace API routes / server actions)
 * - sensitive standalone API routes (search, notifications, heartbeat)
 *
 * A token is revoked when it was issued before User.lastLogoutAt, which is
 * updated by the admin session-revoke API and the logout tracker. Revoked
 * callers are sent to /api/auth/force-logout, which clears the Auth.js
 * cookie server-side and lands on /login — no crash, no redirect loop.
 * Fail-open on DB outage (availability over strictness for this check).
 */
export async function isSessionRevoked(userId: string, iat?: number | null): Promise<boolean> {
  if (!userId || !iat) return false;
  try {
    const user = await db.user.findUnique({
      where: { id: userId },
      select: { lastLogoutAt: true },
    });
    return !!user?.lastLogoutAt && iat * 1000 < user.lastLogoutAt.getTime();
  } catch {
    return false;
  }
}

/** Synchronous variant when lastLogoutAt is already in hand (zero queries). */
export function isRevokedByTimestamp(iat: number | null | undefined, lastLogoutAt: Date | null | undefined): boolean {
  if (!iat || !lastLogoutAt) return false;
  return iat * 1000 < lastLogoutAt.getTime();
}

/**
 * Server-action helper: returns the session only when authenticated AND not
 * revoked. Revoked callers get UnauthorizedError (no crash, no data).
 */
export async function requireLiveSession() {
  const session = await auth();
  if (!session?.user?.id) throw new UnauthorizedError();
  if (await isSessionRevoked(session.user.id, session.user.iat)) {
    throw new UnauthorizedError("Session revoked. Please log in again.");
  }
  return session;
}
