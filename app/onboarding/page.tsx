import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { AuthShell } from "@/components/auth/auth-shell";
import { OnboardingForm } from "@/components/auth/onboarding-form";

export const metadata: Metadata = { title: "Set up your workspace" };

export default async function OnboardingPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (session.user.organizationId) redirect("/dashboard");

  return (
    <AuthShell title="Set up your workspace" subtitle="You're logged in. Now create your team's home.">
      <OnboardingForm userName={session.user.name || session.user.email} />
    </AuthShell>
  );
}
