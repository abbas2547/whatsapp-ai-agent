import { db, Prisma } from "@/lib/db";

type AuditInput = {
  organizationId: string;
  userId?: string | null;
  action: string;
  entityType?: string;
  entityId?: string;
  metadata?: Record<string, unknown>;
};

export async function writeAuditLog(input: AuditInput) {
  // Auxiliary write: never let an audit failure break the business operation.
  try {
    await db.auditLog.create({
      data: {
        organizationId: input.organizationId,
        userId: input.userId || undefined,
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId,
        metadata: sanitize(input.metadata) as Prisma.InputJsonValue,
      },
    });
  } catch (error) {
    console.error("audit log write failed", error instanceof Error ? error.message : "unknown");
  }
}

export async function recordUsage(
  organizationId: string,
  type: string,
  quantity = 1,
  metadata?: Record<string, unknown>,
) {
  // Auxiliary write: usage tracking must not fail AI turns or webhooks.
  try {
    await db.usageEvent.create({
      data: {
        organizationId,
        type,
        quantity,
        metadata: sanitize(metadata) as Prisma.InputJsonValue,
      },
    });
  } catch (error) {
    console.error("usage write failed", error instanceof Error ? error.message : "unknown");
  }
}

function sanitize(metadata?: Record<string, unknown>) {
  if (!metadata) return undefined;
  const blocked = ["apiKey", "accessToken", "password", "secret", "token", "refreshToken", "encryptedValue"];
  const clean: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(metadata)) {
    if (blocked.some((b) => key.toLowerCase().includes(b.toLowerCase()))) continue;
    clean[key] = value;
  }
  return clean;
}
