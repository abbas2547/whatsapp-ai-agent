import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { env, isPlaceholder } from "@/lib/env";
import { AuthShell } from "@/components/auth/auth-shell";
import { LoginForm } from "@/components/auth/login-form";

export const metadata: Metadata = { title: "Log in" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await auth();
  if (session?.user) {
    redirect(session.user.organizationId ? "/dashboard" : "/onboarding");
  }

  const sp = await searchParams;
  const authError = typeof sp.error === "string" ? sp.error : undefined;
  const justCreated = sp.created === "1";

  const googleEnabled =
    !isPlaceholder(env().GOOGLE_CLIENT_ID) && !isPlaceholder(env().GOOGLE_CLIENT_SECRET);

  return (
    <AuthShell title="Welcome back" subtitle="Log in to run your WhatsApp operation.">
      <LoginForm googleEnabled={googleEnabled} authError={authError} justCreated={justCreated} />
    </AuthShell>
  );
}
