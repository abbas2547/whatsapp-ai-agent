import { NextRequest, NextResponse } from "next/server";
import { db, Prisma } from "@/lib/db";
import { getAdminContext } from "@/lib/admin";
import { presenceThresholdMs } from "@/lib/presence";

export async function GET(req: NextRequest) {
  const ctx = await getAdminContext();
  if (!ctx) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const q = (req.nextUrl.searchParams.get("q") || "").slice(0, 100);
  const filter = req.nextUrl.searchParams.get("filter") || "all";
  const onlineSince = new Date(Date.now() - presenceThresholdMs());
  const and: Prisma.UserWhereInput[] = [];
  if (q) and.push({ OR: [{ email: { contains: q, mode: "insensitive" } }, { name: { contains: q, mode: "insensitive" } }] });
  if (filter === "online") and.push({ lastSeenAt: { gte: onlineSince } });
  if (filter === "offline") and.push({ OR: [{ lastSeenAt: { lt: onlineSince } }, { lastSeenAt: null }] });
  const where: Prisma.UserWhereInput = and.length ? { AND: and } : {};
  const users = await db.user.findMany({
    where, orderBy: { createdAt: "desc" }, take: 50,
    select: { id: true, name: true, email: true, createdAt: true, lastLoginAt: true, lastSeenAt: true },
  });
  // Never expose password hashes or tokens.
  return NextResponse.json({ ok: true, users });
}
