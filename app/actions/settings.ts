"use server";

import { z } from "zod";
import { MemberRole } from "@prisma/client";
import { db } from "@/lib/db";
import { assertAdmin, assertCanManageAgents, requireOrgContext } from "@/lib/tenant";
import { updateMemberRole } from "@/services/organization/organization.service";
import { fail } from "./_shared";

export async function saveQualificationAction(fields: Array<{ key: string; label: string; required: boolean }>) {
  try {
    const ctx = await requireOrgContext();
    assertCanManageAgents(ctx);
    const parsed = z.array(z.object({
      key: z.string().trim().min(1).max(64).regex(/^[a-zA-Z0-9_-]+$/, "Invalid field key"),
      label: z.string().trim().min(1).max(100),
      required: z.boolean(),
    })).max(30).parse(fields);
    await db.qualificationField.deleteMany({ where: { organizationId: ctx.organizationId } });
    await db.qualificationField.createMany({
      data: parsed.map((f, sortOrder) => ({
        organizationId: ctx.organizationId,
        key: f.key,
        label: f.label,
        required: f.required,
        sortOrder,
      })),
    });
    return { ok: true as const };
  } catch (error) {
    return fail(error);
  }
}

export async function updateMemberRoleAction(memberId: string, role: MemberRole) {
  try {
    const ctx = await requireOrgContext();
    assertAdmin(ctx);
    const parsedMemberId = z.string().min(1).max(64).parse(memberId);
    const parsedRole = z.enum(["OWNER", "ADMIN", "AGENT_MANAGER", "SUPPORT", "VIEWER"]).parse(role);
    // Admins can't demote themselves to avoid lockout via a single misclick;
    // last-owner protection lives in updateMemberRole.
    await updateMemberRole(ctx.organizationId, ctx.userId, parsedMemberId, parsedRole);
    return { ok: true as const };
  } catch (error) {
    return fail(error);
  }
}

export async function updateOrgNameAction(name: string) {
  try {
    const ctx = await requireOrgContext();
    assertAdmin(ctx);
    const parsed = z.string().trim().min(2).max(100).parse(name);
    await db.organization.update({ where: { id: ctx.organizationId }, data: { name: parsed } });
    return { ok: true as const };
  } catch (error) {
    return fail(error);
  }
}
