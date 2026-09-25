import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { formatPhone } from "@/lib/utils";
import { AppError } from "@/lib/errors";

export const CONTACTS_PAGE_SIZE = 30;

export type ContactSort = "recent" | "name" | "oldest";

export async function listContacts(organizationId: string, query?: string, tag?: string, page = 1, sort: ContactSort = "recent") {
  return db.contact.findMany({
    where: {
      organizationId,
      AND: [
        query
          ? {
              OR: [
                { name: { contains: query, mode: "insensitive" } },
                { phone: { contains: query } },
                { email: { contains: query, mode: "insensitive" } },
                { company: { contains: query, mode: "insensitive" } },
              ],
            }
          : {},
        tag ? { tags: { some: { tag: { name: tag } } } } : {},
      ],
    },
    select: {
      id: true,
      name: true,
      phone: true,
      email: true,
      company: true,
      source: true,
      createdAt: true,
      updatedAt: true,
      tags: { select: { tag: { select: { id: true, name: true } } } },
    },
    orderBy: sort === "name" ? { name: "asc" } : sort === "oldest" ? { createdAt: "asc" } : { updatedAt: "desc" },
    take: CONTACTS_PAGE_SIZE,
    skip: (Math.max(1, page) - 1) * CONTACTS_PAGE_SIZE,
  });
}

export async function countContacts(organizationId: string, query?: string, tag?: string) {
  return db.contact.count({
    where: {
      organizationId,
      AND: [
        query
          ? {
              OR: [
                { name: { contains: query, mode: "insensitive" } },
                { phone: { contains: query } },
                { email: { contains: query, mode: "insensitive" } },
                { company: { contains: query, mode: "insensitive" } },
              ],
            }
          : {},
        tag ? { tags: { some: { tag: { name: tag } } } } : {},
      ],
    },
  });
}

export async function getContact(organizationId: string, id: string) {
  const contact = await db.contact.findFirst({
    where: { id, organizationId },
    include: {
      tags: { include: { tag: true } },
      leads: { orderBy: { createdAt: "desc" }, take: 10 },
      conversations: {
        select: {
          id: true,
          status: true,
          lastMessageAt: true,
          updatedAt: true,
          messages: { select: { id: true, content: true, senderType: true, createdAt: true }, take: 1, orderBy: { createdAt: "desc" } },
        },
        orderBy: { lastMessageAt: "desc" },
        take: 10,
      },
      appointments: { orderBy: { startAt: "desc" }, take: 10 },
    },
  });
  if (!contact) throw new AppError("Contact not found", "NOT_FOUND", 404);
  return contact;
}

export async function updateContact(organizationId: string, id: string, data: Record<string, unknown>) {
  const allowed = ["name", "email", "company", "notes", "customFields", "source"] as const;
  const payload: Prisma.ContactUpdateInput = {};
  for (const key of allowed) {
    if (key in data) (payload as Record<string, unknown>)[key] = data[key];
  }
  // Verify ownership BEFORE writing (never write-then-check).
  const existing = await db.contact.findFirst({ where: { id, organizationId }, select: { id: true } });
  if (!existing) throw new AppError("Contact not found", "NOT_FOUND", 404);
  return db.contact.update({ where: { id }, data: payload });
}

export async function addTag(organizationId: string, contactId: string, name: string) {
  const contact = await db.contact.findFirst({ where: { id: contactId, organizationId }, select: { id: true } });
  if (!contact) throw new AppError("Contact not found", "NOT_FOUND", 404);
  const tag = await db.tag.upsert({
    where: { organizationId_name: { organizationId, name } },
    update: {},
    create: { organizationId, name },
  });
  await db.contactTag.upsert({
    where: { contactId_tagId: { contactId, tagId: tag.id } },
    update: {},
    create: { contactId, tagId: tag.id },
  });
  return tag;
}

export async function removeTag(organizationId: string, contactId: string, name: string) {
  const tag = await db.tag.findUnique({ where: { organizationId_name: { organizationId, name } } });
  if (!tag) return { removed: false };
  await db.contactTag.deleteMany({ where: { contactId, tagId: tag.id } });
  return { removed: true };
}

export async function importContacts(organizationId: string, rows: Array<{ name?: string; phone: string; email?: string; company?: string }>) {
  let created = 0;
  for (const row of rows) {
    const phone = formatPhone(row.phone);
    if (!phone) continue;
    await db.contact.upsert({
      where: { organizationId_phone: { organizationId, phone } },
      update: { name: row.name, email: row.email, company: row.company },
      create: { organizationId, phone, name: row.name, email: row.email, company: row.company, source: "import" },
    });
    created += 1;
  }
  return { created };
}
