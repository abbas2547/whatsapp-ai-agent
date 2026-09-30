import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { isSessionRevoked } from "@/lib/session-guard";
import { db } from "@/lib/db";

/** Debounced server-side global search scoped to the caller's workspace. */
export async function GET(req: NextRequest) {
  const session = await auth();
  const orgId = session?.user?.organizationId;
  if (!session?.user?.id || !orgId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (await isSessionRevoked(session.user.id, session.user.iat)) {
    return NextResponse.json({ error: "Session revoked" }, { status: 401 });
  }
  const q = (req.nextUrl.searchParams.get("q") || "").trim().slice(0, 80);
  if (q.length < 2) return NextResponse.json({ ok: true, results: [] });
  const [contacts, leads, agents, convs] = await Promise.all([
    db.contact.findMany({ where: { organizationId: orgId, OR: [{ name: { contains: q, mode: "insensitive" } }, { phone: { contains: q } }, { email: { contains: q, mode: "insensitive" } }] }, take: 5, select: { id: true, name: true, phone: true } }),
    db.lead.findMany({ where: { organizationId: orgId, OR: [{ name: { contains: q, mode: "insensitive" } }, { phone: { contains: q } }] }, take: 5, select: { id: true, name: true, phone: true, status: true } }),
    db.agent.findMany({ where: { organizationId: orgId, name: { contains: q, mode: "insensitive" } }, take: 5, select: { id: true, name: true, status: true } }),
    db.conversation.findMany({ where: { organizationId: orgId, contact: { OR: [{ name: { contains: q, mode: "insensitive" } }, { phone: { contains: q } }] } }, take: 5, select: { id: true, contact: { select: { name: true, phone: true } } } }),
  ]);
  return NextResponse.json({
    ok: true,
    results: [
      ...convs.map((c) => ({ kind: "conversation", id: c.id, title: c.contact.name || c.contact.phone, href: `/inbox/${c.id}` })),
      ...contacts.map((c) => ({ kind: "contact", id: c.id, title: c.name || c.phone, href: `/contacts?q=${encodeURIComponent(c.phone)}` })),
      ...leads.map((l) => ({ kind: "lead", id: l.id, title: l.name || l.phone || "Lead", href: `/leads?status=${l.status}` })),
      ...agents.map((a) => ({ kind: "agent", id: a.id, title: a.name, href: `/agents/${a.id}` })),
    ],
  });
}
