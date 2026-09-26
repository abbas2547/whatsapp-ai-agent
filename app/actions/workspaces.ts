"use server";

import { z } from "zod";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { ForbiddenError, UnauthorizedError } from "@/lib/errors";
import { requireOrgContext } from "@/lib/tenant";
import { createWorkspaceForUser } from "@/services/organization/organization.service";
import { writeAuditLog } from "@/services/audit/audit.service";
import { fail } from "./_shared";

export async function createWorkspaceAction(organizationName: string) {
  try {
    const session = await auth();
    if (!session?.user?.id) throw new UnauthorizedError();
    const name = z.string().trim().min(2).max(100).parse(organizationName);
    const org = await createWorkspaceForUser(session.user.id, name);
    return { ok: true as const, organizationId: org.id };
  } catch (error) {
    return fail(error);
  }
}

export async function createAdditionalWorkspaceAction(organizationName: string) {
  try {
    const session = await auth();
    if (!session?.user?.id) throw new UnauthorizedError();
    const name = z.string().trim().min(2).max(100).parse(organizationName);
    const org = await createWorkspaceForUser(session.user.id, name, { allowMultiple: true });
    return { ok: true as const, organizationId: org.id };
  } catch (error) {
    return fail(error);
  }
}

export async function listMyWorkspacesAction() {
  try {
    const session = await auth();
    if (!session?.user?.id) throw new UnauthorizedError();
    const { listUserWorkspaces } = await import("@/services/organization/organization.service");
    return { ok: true as const, workspaces: await listUserWorkspaces(session.user.id) };
  } catch (error) {
    return fail(error);
  }
}

/**
 * Verifies membership server-side and returns the verified org. The client
 * then refreshes its JWT via `update()`; the jwt callback re-validates
 * membership before accepting the switch (never trusts the browser).
 */
export async function switchWorkspaceAction(organizationId: string) {
  try {
    const session = await auth();
    if (!session?.user?.id) throw new UnauthorizedError();
    const membership = await db.organizationMember.findFirst({
      where: { userId: session.user.id, organizationId },
      select: { organizationId: true, role: true, organization: { select: { name: true } } },
    });
    if (!membership) throw new ForbiddenError("You don't belong to that workspace");
    return { ok: true as const, organizationId: membership.organizationId, role: membership.role };
  } catch (error) {
    return fail(error);
  }
}

export async function completeOnboardingAction() {
  try {
    const ctx = await requireOrgContext();
    await db.organization.update({
      where: { id: ctx.organizationId },
      data: { onboardingCompletedAt: new Date() },
    });
    await writeAuditLog({
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      action: "workspace.onboarding_completed",
      entityType: "organization",
      entityId: ctx.organizationId,
    });
    return { ok: true as const };
  } catch (error) {
    return fail(error);
  }
}
