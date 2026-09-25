import { NextResponse } from "next/server";
import { requireOrgContext } from "@/lib/tenant";
import { listContacts } from "@/services/contacts/contact.service";

export async function GET() {
  const ctx = await requireOrgContext();
  const contacts = await listContacts(ctx.organizationId);
  const header = "name,phone,email,company,source,createdAt";
  const rows = contacts.map((c) =>
    [c.name, c.phone, c.email, c.company, c.source, c.createdAt.toISOString()].map((v) => `"${String(v || "").replaceAll('"', '""')}"`).join(","),
  );
  return new NextResponse([header, ...rows].join("\n"), {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": "attachment; filename=contacts.csv",
    },
  });
}
