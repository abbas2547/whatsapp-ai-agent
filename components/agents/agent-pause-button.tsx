"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Pause, Play } from "lucide-react";
import { setAgentStatusAction } from "@/app/actions/agents";
import { Button } from "@/components/ui/button";

export function AgentPauseButton({
  agentId,
  status,
}: {
  agentId: string;
  status: "DRAFT" | "TESTING" | "ACTIVE" | "PAUSED";
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const paused = status === "PAUSED";

  function toggle(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    startTransition(async () => {
      const result = await setAgentStatusAction(agentId, paused ? "ACTIVE" : "PAUSED");
      if (result.ok) {
        toast.success(paused ? "Agent resumed" : "Agent paused — AI stopped replying");
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  }

  // Only real backend-supported transitions are exposed. Delete/duplicate
  // have no backend implementation, so they are intentionally absent.
  if (status !== "ACTIVE" && status !== "PAUSED") return null;

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={toggle}
      loading={pending}
      title={paused ? "Resume agent" : "Pause agent"}
    >
      {paused ? <Play /> : <Pause />}
      {paused ? "Resume" : "Pause"}
    </Button>
  );
}
