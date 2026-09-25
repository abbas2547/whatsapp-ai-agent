"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { toast } from "sonner";
import { Building2 } from "lucide-react";
import { createWorkspaceAction } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { Input, Label, FieldError, FieldHint } from "@/components/ui/input";

export function OnboardingForm({ userName }: { userName?: string | null }) {
  const router = useRouter();
  const { update } = useSession();
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (name.trim().length < 2 || pending) return;
    setError(null);
    startTransition(async () => {
      const result = await createWorkspaceAction(name.trim());
      if (result.ok) {
        // Refresh the JWT so it picks up the new membership, then enter.
        await update().catch(() => undefined);
        toast.success("Workspace created");
        router.replace("/dashboard");
        router.refresh();
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <div className="flex items-center gap-3 rounded-2xl border border-border bg-card p-4">
        <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary/10">
          <Building2 className="h-5 w-5 text-primary" />
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{userName || "Your account"} is ready</p>
          <p className="text-xs text-muted-foreground">One last step — name your workspace.</p>
        </div>
      </div>
      <div>
        <Label htmlFor="organizationName">Workspace name</Label>
        <Input
          id="organizationName"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Acme Inc"
          autoComplete="organization"
          required
          minLength={2}
          autoFocus
        />
        <FieldHint>This becomes your team&apos;s home for agents, inbox and leads.</FieldHint>
      </div>
      {error ? <FieldError>{error}</FieldError> : null}
      <Button type="submit" loading={pending} disabled={name.trim().length < 2} className="w-full" size="lg">
        {pending ? "Creating…" : "Create workspace"}
      </Button>
    </form>
  );
}
