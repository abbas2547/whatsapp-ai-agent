import { NextResponse } from "next/server";
import { google } from "googleapis";
import { signState } from "@/lib/encryption";
import { appUrl, env, isPlaceholder } from "@/lib/env";
import { requireOrgContext, assertAdmin } from "@/lib/tenant";

function oauth() {
  if (isPlaceholder(env().GOOGLE_CLIENT_ID) || isPlaceholder(env().GOOGLE_CLIENT_SECRET)) {
    throw new Error("Google OAuth is not configured");
  }
  return new google.auth.OAuth2(
    env().GOOGLE_CLIENT_ID,
    env().GOOGLE_CLIENT_SECRET,
    `${appUrl()}/api/integrations/google/callback`,
  );
}

export async function GET() {
  try {
    const ctx = await requireOrgContext();
    assertAdmin(ctx);
    const client = oauth();
    const url = client.generateAuthUrl({
      access_type: "offline",
      prompt: "consent",
      scope: [
        "https://www.googleapis.com/auth/calendar",
        "https://www.googleapis.com/auth/gmail.send",
      ],
      // Signed so the callback can reject forged `state` values.
      state: signState(ctx.organizationId),
    });
    return NextResponse.redirect(url);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Google OAuth failed" }, { status: 400 });
  }
}
