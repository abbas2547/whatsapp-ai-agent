import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { cookies } from "next/headers";
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
    // Bind the flow to this user+org with a single-use nonce stored in an
    // httpOnly cookie. The callback rejects flows where the cookie is missing
    // or the user changed — this stops an attacker from feeding a victim a
    // crafted Google URL to implant tokens into the wrong workspace.
    const nonce = randomBytes(16).toString("hex");
    const jar = await cookies();
    jar.set("google_oauth_nonce", nonce, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/api/integrations/google/callback",
      maxAge: 600,
    });
    const url = client.generateAuthUrl({
      access_type: "offline",
      prompt: "consent",
      scope: [
        "https://www.googleapis.com/auth/calendar",
        "https://www.googleapis.com/auth/gmail.send",
      ],
      // Signed so the callback can reject forged `state` values.
      state: signState(`${ctx.organizationId}:${ctx.userId}:${nonce}`),
    });
    return NextResponse.redirect(url);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Google OAuth failed" }, { status: 400 });
  }
}
