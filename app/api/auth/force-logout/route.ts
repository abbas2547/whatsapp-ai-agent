import { redirect } from "next/navigation";
import { auth, signOut } from "@/auth";
import { isSessionRevoked } from "@/lib/session-guard";

/**
 * Completes an admin force-logout (or self logout edge case): clears the
 * Auth.js session cookie correctly per environment and lands on /login.
 * Only signs out when the session is actually revoked — otherwise this is a
 * no-op redirect so the URL can't be abused to log users out.
 */
export async function GET() {
  const session = await auth();
  if (session?.user?.id && (await isSessionRevoked(session.user.id, session.user.iat))) {
    await signOut({ redirectTo: "/login?revoked=1" });
  }
  redirect("/dashboard");
}
