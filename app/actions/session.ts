"use server";

import { redirect } from "next/navigation";
import { auth } from "@/auth";

/**
 * Tiny session gate imported by every app page. Lives in its own module so
 * pages compile WITHOUT pulling the heavy service graph (AI, WhatsApp,
 * googleapis) that the domain action modules import.
 */
export async function requireSessionOrRedirect() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  // Authenticated (e.g. first Google sign-in) but no workspace yet.
  if (!session.user.organizationId) redirect("/onboarding");
  return session;
}
