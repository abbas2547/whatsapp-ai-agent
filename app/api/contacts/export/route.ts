import { NextResponse } from "next/server";
import { requireOrgContext } from "@/lib/tenant";
import { CONTACTS_PAGE_SIZE, listContacts } from "@/services/contacts/contact.service";

/** Prefix CSV cells that could execute as spreadsheet formulas (=, +, -, @). */
function csvCell(value: unknown): string {
  let s = String(value ?? "");
  if (/^[=+\-@]/.test(s)) s = `'${s}`;
  return `"${s.replaceAll('"', '""')}"`;
}

export async function GET() {
  const ctx = await requireOrgContext();
  // Cap export size: listContacts pages at CONTACTS_PAGE_SIZE; exporting the
  // whole table unbounded would allow a DoS. 2k rows is plenty for CSV.
  const MAX_EXPORT_ROWS = 2000;
  const pages = Math.ceil(MAX_EXPORT_ROWS / CONTACTS_PAGE_SIZE);
  const all: Awaited<ReturnType<typeof listContacts>> = [];
  for (let page = 1; page <= pages; page++) {
    const batch = await listContacts(ctx.organizationId, undefined, undefined, page, "recent");
    all.push(...batch);
    if (batch.length < CONTACTS_PAGE_SIZE) break;
  }
  const header = "name,phone,email,company,source,createdAt";
  const rows = all.slice(0, MAX_EXPORT_ROWS).map((c) =>
    [c.name, c.phone, c.email, c.company, c.source, c.createdAt.toISOString()].map(csvCell).join(","),
  );
  return new NextResponse([header, ...rows].join("\n"), {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": "attachment; filename=contacts.csv",
    },
  });
}
