import bcrypt from "bcryptjs";
import { MemberRole } from "@prisma/client";
import { db } from "@/lib/db";
import { slugify } from "@/lib/utils";
import { AppError } from "@/lib/errors";
import { writeAuditLog } from "@/services/audit/audit.service";

const DEFAULT_QUALIFICATION_FIELDS = [
  { key: "name", label: "Name", sortOrder: 1 },
  { key: "service", label: "Service", sortOrder: 2 },
  { key: "budget", label: "Budget", sortOrder: 3 },
  { key: "timeline", label: "Timeline", sortOrder: 4 },
  { key: "email", label: "Email", sortOrder: 5 },
];

async function uniqueSlug(baseSlug: string) {
  let slug = baseSlug;
  let i = 1;
  while (await db.organization.findUnique({ where: { slug } })) {
    slug = `${baseSlug}-${i++}`;
  }
  return slug;
}

export async function registerWorkspace(input: {
  name: string;
  email: string;
  password: string;
  organizationName: string;
}) {
  const email = input.email.toLowerCase().trim();
  const existing = await db.user.findUnique({ where: { email } });
  if (existing) throw new AppError("An account with this email already exists", "EMAIL_TAKEN", 409);

  const passwordHash = await bcrypt.hash(input.password, 12);
  const slug = await uniqueSlug(slugify(input.organizationName) || "workspace");

  const result = await db.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        email,
        name: input.name,
        passwordHash,
      },
    });
    const organization = await tx.organization.create({
      data: { name: input.organizationName, slug },
    });
    await tx.organizationMember.create({
      data: {
        userId: user.id,
        organizationId: organization.id,
        role: MemberRole.OWNER,
      },
    });
    await tx.qualificationField.createMany({
      data: DEFAULT_QUALIFICATION_FIELDS.map((f) => ({ ...f, organizationId: organization.id })),
    });
    return { user, organization };
  });

  await writeAuditLog({
    organizationId: result.organization.id,
    userId: result.user.id,
    action: "workspace.created",
    entityType: "organization",
    entityId: result.organization.id,
  });

  return result;
}

/**
 * Creates a workspace for an already-authenticated user (e.g. first Google
 * sign-in, where NextAuth creates the User row but no organization exists).
 */
export async function createWorkspaceForUser(userId: string, organizationName: string) {
  const name = organizationName.trim();
  if (name.length < 2) throw new AppError("Organization name is too short", "INVALID_ORG_NAME", 400);
  const user = await db.user.findUnique({ where: { id: userId } });
  if (!user) throw new AppError("Account not found. Please log in again.", "NO_ACCOUNT", 401);
  const existingMembership = await db.organizationMember.findFirst({ where: { userId } });
  if (existingMembership) throw new AppError("You already belong to a workspace", "ALREADY_MEMBER", 409);

  const slug = await uniqueSlug(slugify(name) || "workspace");
  const organization = await db.$transaction(async (tx) => {
    const org = await tx.organization.create({ data: { name, slug } });
    await tx.organizationMember.create({
      data: { userId, organizationId: org.id, role: MemberRole.OWNER },
    });
    await tx.qualificationField.createMany({
      data: DEFAULT_QUALIFICATION_FIELDS.map((f) => ({ ...f, organizationId: org.id })),
    });
    return org;
  });

  await writeAuditLog({
    organizationId: organization.id,
    userId,
    action: "workspace.created",
    entityType: "organization",
    entityId: organization.id,
  });

  return organization;
}

export async function listMembers(organizationId: string) {
  return db.organizationMember.findMany({
    where: { organizationId },
    include: { user: { select: { id: true, email: true, name: true, image: true } } },
    orderBy: { createdAt: "asc" },
  });
}

export async function updateMemberRole(
  organizationId: string,
  actorUserId: string,
  memberId: string,
  role: MemberRole,
) {
  const member = await db.organizationMember.findFirst({
    where: { id: memberId, organizationId },
  });
  if (!member) throw new AppError("Member not found", "NOT_FOUND", 404);
  if (member.role === "OWNER" && role !== "OWNER") {
    const owners = await db.organizationMember.count({
      where: { organizationId, role: "OWNER" },
    });
    if (owners <= 1) throw new AppError("At least one owner is required", "LAST_OWNER");
  }
  const updated = await db.organizationMember.update({
    where: { id: member.id },
    data: { role },
  });
  await writeAuditLog({
    organizationId,
    userId: actorUserId,
    action: "member.role_updated",
    entityType: "organization_member",
    entityId: member.id,
    metadata: { role },
  });
  return updated;
}
