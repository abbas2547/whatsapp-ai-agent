import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { AuthShell } from "@/components/auth/auth-shell";
import { RegisterForm } from "@/components/auth/register-form";

export const metadata: Metadata = { title: "Create your workspace" };

export default async function RegisterPage() {
  const session = await auth();
  if (session?.user) {
    redirect(session.user.organizationId ? "/dashboard" : "/onboarding");
  }

  return (
    <AuthShell
      title="Create your workspace"
      subtitle="Your AI employees, inbox, leads and automations live here."
    >
      <RegisterForm />
    </AuthShell>
  );
}
