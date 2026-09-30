import { auth } from "@/auth";
import { db, Prisma } from "@/lib/db";

/**
 * Centralized server-side admin authorization.
 * ONLY abbaszaidi028@gmail.com (or ADMIN_EMAIL override) is admin.
 * NEVER trust client-sent flags. Every /admin page + /api/admin/* must call requireAdmin().
 */
export function adminEmail(): string {
  return (process.env.ADMIN_EMAIL || "abbaszaidi028@gmail.com").toLowerCase().trim();
}

export function isAdminEmail(email?: string | null): boolean {
  if (!email) return false;
  return email.toLowerCase().trim() === adminEmail();
}

export type AdminContext = {
  userId: string;
  email: string;
  name: string | null;
};

export async function getAdminContext(): Promise<AdminContext | null> {
  const session = await auth();
  const email = session?.user?.email?.toLowerCase().trim() || "";
  const userId = session?.user?.id;
  if (!userId || !email) return null;
  if (!isAdminEmail(email)) return null;
  // Verify against DB so deleted/disabled accounts can't pass on a stale JWT.
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, name: true, lastLogoutAt: true },
  });
  if (!user || !isAdminEmail(user.email)) return null;
  // Revoked (force-logout) admin sessions are rejected too.
  const iat = (session.user as { iat?: number }).iat;
  if (iat && user.lastLogoutAt && iat * 1000 < user.lastLogoutAt.getTime()) return null;
  return { userId: user.id, email: user.email, name: user.name };
}

export class AdminForbiddenError extends Error {
  status = 403;
  constructor() {
    super("Forbidden: admin access required");
  }
}

/** Use in pages/layouts: redirects to /dashboard when not admin. */
export async function requireAdmin(): Promise<AdminContext> {
  const ctx = await getAdminContext();
  if (!ctx) throw new AdminForbiddenError();
  return ctx;
}

/** Use in API routes: returns 403 JSON when not admin. */
export async function requireAdminApi() {
  const ctx = await getAdminContext();
  return ctx;
}

function sanitizeMeta(meta?: Record<string, unknown>) {
  if (!meta) return undefined;
  const blocked = ["password", "apiKey", "apikey", "secret", "token", "accessToken", "refresh", "encrypted", "credential"];
  const clean: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(meta)) {
    if (blocked.some((b) => k.toLowerCase().includes(b))) continue;
    if (typeof v === "string" && v.length > 500) clean[k] = v.slice(0, 500);
    else clean[k] = v;
  }
  return clean;
}

export async function logAdminAction(input: {
  actorId?: string | null;
  actorEmail?: string | null;
  action: string;
  resource?: string | null;
  resourceId?: string | null;
  workspaceId?: string | null;
  result?: "SUCCESS" | "DENIED" | "ERROR";
  ip?: string | null;
  metadata?: Record<string, unknown>;
}) {
  try {
    await db.adminAuditLog.create({
      data: {
        actorId: input.actorId || undefined,
        actorEmail: input.actorEmail ? input.actorEmail.slice(0, 254) : undefined,
        action: input.action.slice(0, 80),
        resource: input.resource?.slice(0, 80),
        resourceId: input.resourceId?.slice(0, 128),
        workspaceId: input.workspaceId?.slice(0, 128),
        result: input.result || "SUCCESS",
        ip: input.ip?.slice(0, 64),
        metadata: sanitizeMeta(input.metadata) as Prisma.InputJsonValue | undefined,
      },
    });
  } catch (e) {
    console.error("[admin-audit] write failed:", e instanceof Error ? e.message : "unknown");
  }
}

export function adminForbiddenResponse() {
  return Response.json({ error: "Forbidden" }, { status: 403 });
}
