import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { safeNextPath } from "@/lib/utils";
import { AuthShell } from "@/components/auth/auth-shell";
import { RegisterForm } from "@/components/auth/register-form";
import { ConfigErrorCard } from "@/components/auth/config-error-card";

export const metadata: Metadata = { title: "Create your workspace" };

export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const next = safeNextPath(typeof sp.next === "string" ? sp.next : null) ?? undefined;
  try {
    const session = await auth();
    if (session?.user) {
      redirect(session.user.organizationId ? (next ?? "/dashboard") : "/onboarding");
    }
  } catch (error) {
    if ((error as { digest?: string })?.digest?.startsWith("NEXT_REDIRECT")) throw error;
    return (
      <AuthShell
        title="Create your workspace"
        subtitle="Your AI employees, inbox, leads and automations live here."
      >
        <ConfigErrorCard message={error instanceof Error ? error.message : undefined} />
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Create your workspace"
      subtitle="Your AI employees, inbox, leads and automations live here."
    >
      <RegisterForm next={next} />
    </AuthShell>
  );
}
