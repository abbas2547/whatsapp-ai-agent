import { redirect } from "next/navigation";
import { requireSessionOrRedirect } from "@/app/actions";
import { db } from "@/lib/db";
import { listUserWorkspaces } from "@/services/organization/organization.service";
import { getActiveSubscription, isPaidActive } from "@/services/billing/entitlements";
import { Shell } from "@/components/shell";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await requireSessionOrRedirect();
  const organizationId = session.user.organizationId!;
  const userId = session.user.id!;

  const [organization, alertCount, workspaces, subscription] = await Promise.all([
    db.organization.findUnique({
      where: { id: organizationId },
      select: { name: true, onboardingCompletedAt: true },
    }),
    db.conversation.count({
      where: { organizationId, unreadCount: { gt: 0 } },
    }),
    listUserWorkspaces(userId),
    getActiveSubscription(organizationId),
  ]);

  if (!organization) redirect("/onboarding");
  // First-run experience: fresh workspaces go through onboarding once.
  if (!organization.onboardingCompletedAt) redirect("/onboarding");

  return (
    <Shell
      user={{
        name: session.user.name,
        email: session.user.email,
        role: session.user.role,
      }}
      organizationName={organization.name}
      organizationId={organizationId}
      workspaces={workspaces}
      alertCount={alertCount}
      planId={subscription.planId}
      paidActive={isPaidActive(subscription)}
    >
      {children}
    </Shell>
  );
}
