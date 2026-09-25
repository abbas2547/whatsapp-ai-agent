import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { listUserWorkspaces } from "@/services/organization/organization.service";
import { AuthShell } from "@/components/auth/auth-shell";
import { OnboardingForm } from "@/components/auth/onboarding-form";
import { OnboardingWizard, type OnboardingStatus } from "@/components/auth/onboarding-wizard";

export const metadata: Metadata = { title: "Get started" };

export default async function OnboardingPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const memberships = await listUserWorkspaces(session.user.id);
  if (!memberships.length) {
    return (
      <AuthShell title="Set up your workspace" subtitle="You're logged in. Now create your team's home.">
        <OnboardingForm userName={session.user.name || session.user.email} />
      </AuthShell>
    );
  }

  const activeId =
    memberships.some((m) => m.id === session.user.organizationId)
      ? session.user.organizationId!
      : memberships[0].id;

  const [org, phones, agentStats, readyDocs, firstAgent] = await Promise.all([
    db.organization.findUnique({
      where: { id: activeId },
      select: { name: true, onboardingCompletedAt: true },
    }),
    db.whatsAppPhoneNumber.findMany({
      where: { organizationId: activeId },
      select: { displayPhoneNumber: true },
      take: 5,
    }),
    db.agent.groupBy({
      by: ["status"],
      where: { organizationId: activeId },
      _count: { status: true },
    }),
    db.knowledgeDocument.count({ where: { organizationId: activeId, status: "READY" } }),
    db.agent.findFirst({
      where: { organizationId: activeId },
      select: { id: true },
      orderBy: { updatedAt: "desc" },
    }),
  ]);

  if (!org) {
    return (
      <AuthShell title="Set up your workspace" subtitle="You're logged in. Now create your team's home.">
        <OnboardingForm userName={session.user.name || session.user.email} />
      </AuthShell>
    );
  }
  if (org.onboardingCompletedAt) redirect("/dashboard");

  const agentsCount = agentStats.reduce((n, g) => n + g._count.status, 0);
  const activeAgentsCount = agentStats
    .filter((g) => g.status === "ACTIVE")
    .reduce((n, g) => n + g._count.status, 0);

  const status: OnboardingStatus = {
    workspaceName: org.name,
    whatsappConnected: phones.length > 0,
    phoneDisplay: phones[0]?.displayPhoneNumber,
    agentsCount,
    activeAgentsCount,
    readyDocsCount: readyDocs,
    firstAgentId: firstAgent?.id,
  };

  return (
    <AuthShell
      title="Welcome to WhatsApp AI Employee"
      subtitle="Let's get your AI employee ready — complete the steps or skip ahead."
    >
      <OnboardingWizard status={status} />
    </AuthShell>
  );
}
