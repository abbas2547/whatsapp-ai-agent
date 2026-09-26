import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { google } from "googleapis";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { encryptSecret, verifyState } from "@/lib/encryption";
import { appUrl, env } from "@/lib/env";
import { writeAuditLog } from "@/services/audit/audit.service";

export async function GET(request: NextRequest) {
  const fail = (reason: string) =>
    NextResponse.redirect(new URL(`/integrations?error=${reason}`, appUrl()));
  try {
    const code = request.nextUrl.searchParams.get("code");
    const state = request.nextUrl.searchParams.get("state");
    const error = request.nextUrl.searchParams.get("error");
    if (error) return fail("google");
    // Reject forged state: only states we signed for an org are accepted.
    const decoded = state ? verifyState(state) : null;
    const [organizationId, stateUserId, nonce] = decoded ? decoded.split(":") : [];
    if (!code || !organizationId || !stateUserId || !nonce) return fail("google");
    // CSRF binding: the flow must complete in the same browser (nonce cookie)
    // and by the same user that started it, and that user must still be an
    // admin of the workspace. Single-use: cookie is cleared immediately.
    const jar = await cookies();
    const cookieNonce = jar.get("google_oauth_nonce")?.value;
    jar.delete("google_oauth_nonce");
    if (!cookieNonce || cookieNonce !== nonce) return fail("google");
    const session = await auth().catch(() => null);
    if (!session?.user?.id || session.user.id !== stateUserId) return fail("google");
    const membership = await db.organizationMember.findFirst({
      where: { organizationId, userId: session.user.id, role: { in: ["OWNER", "ADMIN"] } },
      select: { userId: true },
    });
    if (!membership) return fail("google");
    const oauth = new google.auth.OAuth2(
      env().GOOGLE_CLIENT_ID,
      env().GOOGLE_CLIENT_SECRET,
      `${appUrl()}/api/integrations/google/callback`,
    );
    const { tokens } = await oauth.getToken(code);
    // Reconnect-safe: replace the stored credential instead of stacking duplicates.
    await db.apiCredential.deleteMany({ where: { organizationId, provider: "google" } });
    await db.apiCredential.create({
      data: {
        organizationId,
        provider: "google",
        label: "Google Calendar + Gmail",
        encryptedValue: encryptSecret(JSON.stringify(tokens)),
      },
    });
    await db.integration.createMany({
      data: [
        { organizationId, provider: "GOOGLE_CALENDAR", name: "Google Calendar", enabled: true },
        { organizationId, provider: "GMAIL", name: "Gmail notifications", enabled: true },
      ],
      skipDuplicates: true,
    });
    await db.integration.updateMany({
      where: { organizationId, provider: { in: ["GOOGLE_CALENDAR", "GMAIL"] } },
      data: { enabled: true },
    });
    await writeAuditLog({
      organizationId,
      userId: session.user.id,
      action: "integration.google.connected",
      entityType: "integration",
    });
    return NextResponse.redirect(new URL("/integrations?google=connected", appUrl()));
  } catch {
    return fail("google");
  }
}
