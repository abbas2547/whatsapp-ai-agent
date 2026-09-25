import { NextRequest, NextResponse } from "next/server";
import { google } from "googleapis";
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
    const organizationId = state ? verifyState(state) : null;
    if (!code || !organizationId) return fail("google");
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
      action: "integration.google.connected",
      entityType: "integration",
    });
    return NextResponse.redirect(new URL("/integrations?google=connected", appUrl()));
  } catch {
    return fail("google");
  }
}
