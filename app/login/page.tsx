import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { env, isPlaceholder } from "@/lib/env";
import { safeNextPath } from "@/lib/utils";
import { AuthShell } from "@/components/auth/auth-shell";
import { LoginForm } from "@/components/auth/login-form";
import { ConfigErrorCard } from "@/components/auth/config-error-card";
import { ProdUrlWarning } from "@/components/auth/prod-url-warning";

export const metadata: Metadata = { title: "Log in" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const authError = typeof sp.error === "string" ? sp.error : undefined;
  const justCreated = sp.created === "1";
  const wasRevoked = sp.revoked === "1";
  const next = safeNextPath(typeof sp.next === "string" ? sp.next : null) ?? undefined;

  // Never crash the login page on misconfiguration (e.g. missing env vars
  // on a fresh deploy): show an actionable message instead.
  try {
    const session = await auth();
    if (session?.user) {
      redirect(session.user.organizationId ? (next ?? "/dashboard") : "/onboarding");
    }
  } catch (error) {
    if ((error as { digest?: string })?.digest?.startsWith("NEXT_REDIRECT")) throw error;
    return (
      <AuthShell title="Welcome back" subtitle="Log in to run your WhatsApp operation.">
        <ConfigErrorCard message={error instanceof Error ? error.message : undefined} />
      </AuthShell>
    );
  }

  let googleEnabled = false;
  try {
    googleEnabled =
      !isPlaceholder(env().GOOGLE_CLIENT_ID) && !isPlaceholder(env().GOOGLE_CLIENT_SECRET);
  } catch {
    googleEnabled = false;
  }

  return (
    <AuthShell title="Welcome back" subtitle="Log in to run your WhatsApp operation.">
      <ProdUrlWarning />
      {wasRevoked && (
        <p className="mb-4 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2.5 text-[13px] font-medium text-amber-700 dark:text-amber-300" role="status">
          Your session was signed out. Please log in again.
        </p>
      )}
      <LoginForm googleEnabled={googleEnabled} authError={authError} justCreated={justCreated} next={next} />
    </AuthShell>
  );
}
