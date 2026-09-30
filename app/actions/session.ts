"use server";

import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { isSessionRevoked } from "@/lib/session-guard";

/**
 * Tiny session gate imported by every app page. Lives in its own module so
 * pages compile WITHOUT pulling the heavy service graph (AI, WhatsApp,
 * googleapis) that the domain action modules import.
 */
export async function requireSessionOrRedirect() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  // Revoked (admin force-logout): clear the cookie server-side and land on
  // login. Never throws JWTSessionError — just redirects.
  if (session.user.id && (await isSessionRevoked(session.user.id, session.user.iat))) {
    redirect("/api/auth/force-logout");
  }
  // Authenticated (e.g. first Google sign-in) but no workspace yet.
  if (!session.user.organizationId) redirect("/onboarding");
  return session;
}
