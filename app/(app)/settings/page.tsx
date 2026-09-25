import type { Metadata } from "next";
import { requireSessionOrRedirect } from "@/app/actions";
import { listMembers } from "@/services/organization/organization.service";
import { db } from "@/lib/db";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/badge";
import { OrgNameForm, MemberRow, QualificationFieldsEditor } from "@/components/settings";

export const metadata: Metadata = { title: "Settings" };
export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const session = await requireSessionOrRedirect();
  const orgId = session.user.organizationId!;
  const role = (session.user.role as "OWNER" | "ADMIN" | "AGENT_MANAGER" | "SUPPORT" | "VIEWER") || "VIEWER";

  const [organization, members, qualificationFields] = await Promise.all([
    db.organization.findUnique({ where: { id: orgId }, select: { id: true, name: true } }),
    listMembers(orgId),
    db.qualificationField.findMany({ where: { organizationId: orgId }, orderBy: { sortOrder: "asc" } }),
  ]);

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5">
      <PageHeader title="Settings" description="Workspace profile, team, and lead qualification." />

      {organization ? <OrgNameForm orgId={organization.id} name={organization.name} /> : null}

      <Card>
        <CardHeader>
          <CardTitle>Team members</CardTitle>
          <CardDescription>Owners and admins can change roles. Roles: Owner, Admin, Agent Manager, Support, Viewer.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col divide-y">
          {members.map((m) => (
            <MemberRow key={m.id} member={m} viewerRole={role} />
          ))}
        </CardContent>
      </Card>

      <QualificationFieldsEditor initial={qualificationFields} />

      <Card>
        <CardHeader>
          <CardTitle>Your role</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            You are signed in as <span className="font-medium text-foreground">{role.replaceAll("_", " ")}</span>.
            Owners and admins can manage the workspace.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}