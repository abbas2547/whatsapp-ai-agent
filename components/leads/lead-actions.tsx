"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { LeadStatus } from "@prisma/client";
import { updateLeadAction } from "@/app/actions";
import { Select } from "@/components/ui/select";

const STATUSES: LeadStatus[] = ["NEW", "CONTACTED", "QUALIFIED", "PROPOSAL", "WON", "LOST"];

export function LeadStatusSelect({ leadId, status }: { leadId: string; status: LeadStatus }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function change(next: string) {
    if (next === status) return;
    startTransition(async () => {
      const result = await updateLeadAction(leadId, { status: next as LeadStatus });
      if (result.ok) {
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  }

  return (
    <Select value={status} onChange={(e) => change(e.target.value)} disabled={pending} className="h-8 w-32 text-xs">
      {STATUSES.map((s) => (
        <option key={s} value={s}>
          {s.replaceAll("_", " ")}
        </option>
      ))}
    </Select>
  );
}