"use server";

import { z } from "zod";
import { db } from "@/lib/db";
import { encryptSecret } from "@/lib/encryption";
import { AppError } from "@/lib/errors";
import { assertAdmin, requireOrgContext } from "@/lib/tenant";
import { writeAuditLog } from "@/services/audit/audit.service";
import { fail } from "./_shared";

export async function saveHttpIntegrationAction(input: {
  name: string;
  url: string;
  method: "GET" | "POST" | "PUT" | "PATCH";
  headers?: Record<string, string>;
  secret?: string;
  authHeader?: string;
}) {
  try {
    const ctx = await requireOrgContext();
    assertAdmin(ctx);
    const parsed = z.object({
      name: z.string().trim().min(1).max(100),
      url: z.string().trim().min(1).max(2048),
      method: z.enum(["GET", "POST", "PUT", "PATCH"]),
      headers: z.record(z.string(), z.string()).optional(),
      secret: z.string().max(2000).optional(),
      authHeader: z.string().max(64).optional(),
    }).parse(input);
    // SSRF guard at write time (also enforced at request time): https only,
    // no private/loopback/metadata hosts, no embedded credentials.
    let endpoint: URL;
    try {
      endpoint = new URL(parsed.url);
    } catch {
      throw new AppError("URL must be a valid https URL.", "INVALID_INPUT", 400);
    }
    if (endpoint.protocol !== "https:") throw new AppError("URL must use https.", "INVALID_INPUT", 400);
    const host = endpoint.hostname.toLowerCase();
    const blocked =
      host === "localhost" || host.endsWith(".internal") || host.endsWith(".local") ||
      host === "metadata.google.internal" ||
      /^(\d{1,3}\.){3}\d{1,3}$/.test(host) &&
        (() => {
          const [a, b] = host.split(".").map(Number);
          return a === 10 || a === 127 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 169 && b === 254) || a === 0;
        })();
    if (blocked || endpoint.username || endpoint.password) {
      throw new AppError("That host is not allowed for HTTP integrations.", "INVALID_INPUT", 400);
    }
    if (parsed.headers) {
      const entries = Object.entries(parsed.headers);
      if (entries.length > 20) throw new AppError("Too many headers (max 20).", "INVALID_INPUT", 400);
      for (const [k, v] of entries) {
        if (k.length > 128 || v.length > 2000 || /[\r\n]/.test(k) || /[\r\n]/.test(v)) {
          throw new AppError("Invalid header name or value.", "INVALID_INPUT", 400);
        }
      }
    }
    const integration = await db.integration.create({
      data: {
        organizationId: ctx.organizationId,
        provider: "HTTP",
        name: parsed.name,
        enabled: true,
        config: {
          url: parsed.url,
          method: parsed.method,
          headers: parsed.headers || {},
          authHeader: parsed.authHeader || "Authorization",
        },
      },
    });
    if (parsed.secret) {
      await db.apiCredential.create({
        data: {
          organizationId: ctx.organizationId,
          provider: `http:${integration.id}`,
          label: parsed.name,
          encryptedValue: encryptSecret(parsed.secret),
        },
      });
    }
    await writeAuditLog({
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      action: "integration.http.created",
      entityType: "integration",
      entityId: integration.id,
    });
    return { ok: true as const, id: integration.id };
  } catch (error) {
    return fail(error);
  }
}
