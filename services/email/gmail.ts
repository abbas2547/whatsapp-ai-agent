import { google } from "googleapis";
import { db } from "@/lib/db";
import { decryptSecret } from "@/lib/encryption";
import { env, isPlaceholder } from "@/lib/env";
import { AppError } from "@/lib/errors";

export async function sendGmail(
  organizationId: string,
  input: { to: string; subject: string; body: string },
) {
  const cred = await db.apiCredential.findFirst({
    where: { organizationId, provider: "google" },
    orderBy: { updatedAt: "desc" },
  });
  if (!cred) {
    throw new AppError("Gmail is not connected. Connect Google in Integrations.", "GMAIL_NOT_CONNECTED", 400);
  }
  if (isPlaceholder(env().GOOGLE_CLIENT_ID) || isPlaceholder(env().GOOGLE_CLIENT_SECRET)) {
    throw new AppError("Google OAuth is not configured on the server.", "GOOGLE_OAUTH_MISSING", 400);
  }
  const tokens = JSON.parse(decryptSecret(cred.encryptedValue));
  const oauth = new google.auth.OAuth2(env().GOOGLE_CLIENT_ID, env().GOOGLE_CLIENT_SECRET);
  oauth.setCredentials(tokens);
  const gmail = google.gmail({ version: "v1", auth: oauth });
  const raw = Buffer.from(
    `To: ${input.to}\r\nSubject: ${input.subject}\r\nContent-Type: text/plain; charset=utf-8\r\n\r\n${input.body}`,
  )
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
  await gmail.users.messages.send({ userId: "me", requestBody: { raw } });
  return { sent: true };
}
