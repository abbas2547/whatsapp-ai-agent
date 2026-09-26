"use server";

import { LeadStatus } from "@prisma/client";
import { AppError } from "@/lib/errors";
import { rateLimit } from "@/lib/rate-limit";
import { assertCanWrite, requireOrgContext } from "@/lib/tenant";
import { addTag, importContacts, removeTag, updateContact } from "@/services/contacts/contact.service";
import { updateLead } from "@/services/leads/lead.service";
import { fail } from "./_shared";

export async function updateLeadAction(leadId: string, data: { status?: LeadStatus; notes?: string; score?: number }) {
  try {
    const ctx = await requireOrgContext();
    assertCanWrite(ctx);
    return { ok: true as const, lead: await updateLead(ctx.organizationId, leadId, data) };
  } catch (error) {
    return fail(error);
  }
}

export async function updateContactAction(contactId: string, data: Record<string, unknown>) {
  try {
    const ctx = await requireOrgContext();
    assertCanWrite(ctx);
    return { ok: true as const, contact: await updateContact(ctx.organizationId, contactId, data) };
  } catch (error) {
    return fail(error);
  }
}

export async function importContactsAction(csv: string) {
  try {
    const ctx = await requireOrgContext();
    assertCanWrite(ctx);
    if (typeof csv !== "string" || !csv) throw new AppError("No CSV data provided.", "INVALID_INPUT", 400);
    if (csv.length > 500_000) throw new AppError("CSV is too large (max 500 KB). Split the import.", "LIMIT", 400);
    const limited = rateLimit(`import:${ctx.organizationId}`, 10, 60_000);
    if (!limited.success) throw new AppError("Too many imports. Please wait a minute.", "RATE_LIMITED", 429);
    const lines = csv.split(/\r?\n/).slice(0, 2001);
    // Minimal quoted-CSV parser (handles "a,b",c and escaped "").
    const parseLine = (line: string): string[] => {
      const out: string[] = [];
      let cur = "";
      let quoted = false;
      for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (quoted) {
          if (ch === '"') {
            if (line[i + 1] === '"') { cur += '"'; i++; }
            else quoted = false;
          } else cur += ch;
        } else if (ch === '"') quoted = true;
        else if (ch === ",") { out.push(cur); cur = ""; }
        else cur += ch;
      }
      out.push(cur);
      return out.map((s) => s.trim().slice(0, 200));
    };
    const rows = lines
      .slice(1, 1001)
      .flatMap((line) => {
        if (!line.trim()) return [] as Array<{ name?: string; phone: string; email?: string; company?: string }>;
        const [name, phone, email, company] = parseLine(line);
        if (!phone) return [] as Array<{ name?: string; phone: string; email?: string; company?: string }>;
        return [{ name, phone, email, company }];
      });
    return { ok: true as const, ...(await importContacts(ctx.organizationId, rows)) };
  } catch (error) {
    return fail(error);
  }
}

export async function addTagAction(contactId: string, name: string) {
  try {
    const ctx = await requireOrgContext();
    assertCanWrite(ctx);
    await addTag(ctx.organizationId, contactId, name);
    return { ok: true as const };
  } catch (error) {
    return fail(error);
  }
}

export async function removeTagAction(contactId: string, name: string) {
  try {
    const ctx = await requireOrgContext();
    assertCanWrite(ctx);
    await removeTag(ctx.organizationId, contactId, name);
    return { ok: true as const };
  } catch (error) {
    return fail(error);
  }
}
