import { MemberRole } from "@prisma/client";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { ForbiddenError, UnauthorizedError } from "@/lib/errors";

export type OrgContext = {
  userId: string;
  organizationId: string;
  role: MemberRole;
  email: string;
  name: string | null;
};

const writeRoles: MemberRole[] = ["OWNER", "ADMIN", "AGENT_MANAGER", "SUPPORT"];
const manageRoles: MemberRole[] = ["OWNER", "ADMIN", "AGENT_MANAGER"];
const adminRoles: MemberRole[] = ["OWNER", "ADMIN"];

export async function getOrgContext(): Promise<OrgContext | null> {
  const session = await auth();
  if (!session?.user?.id || !session.user.organizationId) return null;
  const membership = await db.organizationMember.findUnique({
    where: {
      organizationId_userId: {
        organizationId: session.user.organizationId,
        userId: session.user.id,
      },
    },
    include: { user: true },
  });
  if (!membership) return null;
  // Revoked (admin force-logout): deny workspace access. Uses the already
  // fetched user row — zero extra queries. Callers throw 401 via
  // requireOrgContext; page gates redirect to force-logout first.
  if (
    session.user.iat &&
    membership.user.lastLogoutAt &&
    session.user.iat * 1000 < membership.user.lastLogoutAt.getTime()
  ) {
    return null;
  }
  return {
    userId: membership.userId,
    organizationId: membership.organizationId,
    role: membership.role,
    email: membership.user.email,
    name: membership.user.name,
  };
}

export async function requireOrgContext(): Promise<OrgContext> {
  const ctx = await getOrgContext();
  if (!ctx) throw new UnauthorizedError();
  return ctx;
}

export function assertRole(ctx: OrgContext, allowed: MemberRole[]) {
  if (!allowed.includes(ctx.role)) {
    throw new ForbiddenError();
  }
}

export function assertCanWrite(ctx: OrgContext) {
  assertRole(ctx, writeRoles);
}

export function assertCanManageAgents(ctx: OrgContext) {
  assertRole(ctx, manageRoles);
}

export function assertAdmin(ctx: OrgContext) {
  assertRole(ctx, adminRoles);
}

export function tenantWhere(organizationId: string) {
  return { organizationId };
}
