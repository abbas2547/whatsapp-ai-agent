import { requireSessionOrRedirect } from "@/app/actions";
import { db } from "@/lib/db";
import { Shell } from "@/components/shell";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await requireSessionOrRedirect();
  const organizationId = session.user.organizationId!;

  const [organization, alertCount] = await Promise.all([
    db.organization.findUnique({
      where: { id: organizationId },
      select: { name: true },
    }),
    db.conversation.count({
      where: { organizationId, unreadCount: { gt: 0 } },
    }),
  ]);

  return (
    <Shell
      user={{
        name: session.user.name,
        email: session.user.email,
        role: session.user.role,
      }}
      organizationName={organization?.name || "Workspace"}
      alertCount={alertCount}
    >
      {children}
    </Shell>
  );
}
