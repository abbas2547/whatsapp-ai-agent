"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ConfirmAction } from "@/components/admin/confirm-action";

async function post(url: string, body: unknown) {
  const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((j as { error?: string }).error || `Request failed (${r.status})`);
}

export function SuspendWorkspaceButton({ id, suspended }: { id: string; suspended: boolean }) {
  const router = useRouter();
  return (
    <ConfirmAction
      title={suspended ? "Reactivate workspace?" : "Suspend workspace?"}
      description={suspended ? "The workspace will regain full access immediately." : "The workspace will be blocked from new activity. Existing data is kept."}
      confirmLabel={suspended ? "Reactivate" : "Suspend"}
      danger={!suspended}
      onConfirm={async () => {
        await post(`/api/admin/workspaces/${id}/${suspended ? "reactivate" : "suspend"}`, {});
        router.refresh();
      }}
    >
      {(open) => (
        <Button size="sm" variant={suspended ? "default" : "destructive"} onClick={open}>
          {suspended ? "Reactivate" : "Suspend"}
        </Button>
      )}
    </ConfirmAction>
  );
}

export function RevokeSessionButton({ id }: { id: string }) {
  const router = useRouter();
  return (
    <ConfirmAction
      title="Revoke this session?"
      description="The session is invalidated server-side and the user is signed out (all devices, since auth tokens are stateless). They must log in again."
      confirmLabel="Revoke session"
      danger
      onConfirm={async () => {
        await post(`/api/admin/sessions/${id}/revoke`, {});
        router.refresh();
      }}
    >
      {(open) => (
        <Button size="sm" variant="outline" onClick={open}>
          Revoke
        </Button>
      )}
    </ConfirmAction>
  );
}

export function ExtendSubscriptionButton({ organizationId }: { organizationId: string }) {
  const router = useRouter();
  return (
    <ConfirmAction
      title="Extend subscription by 30 days?"
      description="The current period end is pushed by 30 days from its current value (or now if expired). Recorded in the audit log."
      confirmLabel="Extend 30 days"
      onConfirm={async () => {
        await post(`/api/admin/subscriptions/${organizationId}/extend`, { days: 30 });
        router.refresh();
      }}
    >
      {(open) => (
        <Button size="sm" variant="outline" onClick={open}>
          Extend
        </Button>
      )}
    </ConfirmAction>
  );
}

export function RetryAutomationButton({ executionId }: { executionId: string }) {
  const router = useRouter();
  return (
    <ConfirmAction
      title="Retry failed execution?"
      description="A new execution is queued from the same workflow and trigger. The retry is recorded."
      confirmLabel="Retry"
      onConfirm={async () => {
        await post(`/api/admin/automations/${executionId}/retry`, {});
        router.refresh();
      }}
    >
      {(open) => (
        <Button size="sm" variant="outline" onClick={open}>
          Retry
        </Button>
      )}
    </ConfirmAction>
  );
}
