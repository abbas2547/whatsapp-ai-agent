"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { MemberRole } from "@prisma/client";
import { saveQualificationAction, updateMemberRoleAction, updateOrgNameAction } from "@/app/actions/settings";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";

const ROLES: MemberRole[] = ["OWNER", "ADMIN", "AGENT_MANAGER", "SUPPORT", "VIEWER"];

export function OrgNameForm({ orgId, name }: { orgId: string; name: string }) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function submit(formData: FormData) {
    const next = String(formData.get("name") || "").trim();
    startTransition(async () => {
      const result = await updateOrgNameAction(next);
      if (result.ok) {
        toast.success("Organization name updated");
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Organization</CardTitle>
      </CardHeader>
      <CardContent>
        <form action={submit} className="flex gap-2">
          <input type="hidden" name="orgId" value={orgId} />
          <Input name="name" defaultValue={name} className="max-w-xs" required />
          <Button type="submit" disabled={pending}>
            Save
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

export function MemberRow({
  member,
  viewerRole,
}: {
  member: { id: string; role: MemberRole; user: { name?: string | null; email: string } };
  viewerRole: MemberRole;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const canChange = ["OWNER", "ADMIN"].includes(viewerRole);

  function change(next: string) {
    startTransition(async () => {
      const result = await updateMemberRoleAction(member.id, next as MemberRole);
      if (result.ok) {
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  }

  return (
    <div className="flex items-center justify-between gap-3 py-2.5">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium">{member.user.name || member.user.email}</p>
        <p className="truncate text-xs text-muted-foreground">{member.user.email}</p>
      </div>
      {canChange ? (
        <Select value={member.role} onChange={(e) => change(e.target.value)} disabled={pending} className="h-8 w-36 text-xs">
          {ROLES.map((r) => (
            <option key={r} value={r}>
              {r.replaceAll("_", " ")}
            </option>
          ))}
        </Select>
      ) : (
        <span className="rounded-full bg-muted px-3 py-1 text-xs font-medium">{member.role.replaceAll("_", " ")}</span>
      )}
    </div>
  );
}

export function QualificationFieldsEditor({
  initial,
}: {
  initial: { id: string; key: string; label: string; required: boolean; sortOrder: number }[];
}) {
  const [fields, setFields] = useState(initial);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function update(index: number, patch: Partial<(typeof fields)[number]>) {
    setFields((fs) => fs.map((f, i) => (i === index ? { ...f, ...patch } : f)));
  }

  function save() {
    startTransition(async () => {
      const result = await saveQualificationAction(
        fields.map((f) => ({ key: f.key, label: f.label, required: f.required })),
      );
      if (result.ok) {
        toast.success("Qualification fields saved");
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Lead qualification fields</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <p className="text-sm text-muted-foreground">
          Agents collect these fields naturally during conversation to score and qualify leads.
        </p>
        {fields.map((f, i) => (
          <div key={f.id} className="flex items-center gap-2">
            <Input
              value={f.label}
              onChange={(e) => update(i, { label: e.target.value })}
              className="flex-1"
              placeholder="Field label"
            />
            <input
              type="checkbox"
              checked={f.required}
              onChange={(e) => update(i, { required: e.target.checked })}
              title="Required"
              className="h-4 w-4 accent-(--primary)"
            />
          </div>
        ))}
        <Button onClick={save} disabled={pending} className="w-fit">
          Save fields
        </Button>
      </CardContent>
    </Card>
  );
}