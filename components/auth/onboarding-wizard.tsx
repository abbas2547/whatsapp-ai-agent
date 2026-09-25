"use client";

import { useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  ArrowRight,
  Bot,
  Building2,
  Check,
  Database,
  FlaskConical,
  Plug,
  Rocket,
} from "lucide-react";
import { completeOnboardingAction } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export type OnboardingStatus = {
  workspaceName: string;
  whatsappConnected: boolean;
  phoneDisplay?: string;
  agentsCount: number;
  activeAgentsCount: number;
  readyDocsCount: number;
  firstAgentId?: string;
};

const STEP_META = [
  { key: "workspace", n: 1, title: "Workspace", description: "Your team's home for agents, inbox and leads." },
  { key: "whatsapp", n: 2, title: "WhatsApp", description: "Connect your Business number to receive customers." },
  { key: "agent", n: 3, title: "AI Agent", description: "Create an AI employee with personality and rules." },
  { key: "knowledge", n: 4, title: "Knowledge", description: "Give the agent approved answers from your docs." },
  { key: "test", n: 5, title: "Test", description: "Talk to the agent before it goes live." },
  { key: "launch", n: 6, title: "Launch", description: "Publish and open your dashboard." },
] as const;

export function OnboardingWizard({ status }: { status: OnboardingStatus }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const done: Record<string, boolean> = {
    workspace: true,
    whatsapp: status.whatsappConnected,
    agent: status.agentsCount > 0,
    knowledge: status.readyDocsCount > 0,
    test: status.activeAgentsCount > 0,
    launch: false,
  };

  const completedCount = Object.values(done).filter(Boolean).length;

  function finish() {
    startTransition(async () => {
      const result = await completeOnboardingAction();
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      router.replace("/dashboard");
      router.refresh();
    });
  }

  function stepAction(key: string) {
    switch (key) {
      case "whatsapp":
        return { href: "/integrations", label: status.whatsappConnected ? "Manage connection" : "Connect WhatsApp" };
      case "agent":
        return { href: "/agents/new", label: status.agentsCount > 0 ? "Create another" : "Create AI agent" };
      case "knowledge":
        return { href: "/knowledge", label: status.readyDocsCount > 0 ? "Add more" : "Upload knowledge" };
      case "test":
        return {
          href: status.firstAgentId ? `/agents/${status.firstAgentId}` : "/agents/new",
          label: "Open test chat",
        };
      default:
        return null;
    }
  }

  function stepNote(key: string): string | null {
    switch (key) {
      case "whatsapp":
        return status.whatsappConnected ? `Connected · ${status.phoneDisplay || "number linked"}` : null;
      case "agent":
        return status.agentsCount > 0
          ? `${status.agentsCount} agent${status.agentsCount === 1 ? "" : "s"} created`
          : null;
      case "knowledge":
        return status.readyDocsCount > 0
          ? `${status.readyDocsCount} document${status.readyDocsCount === 1 ? "" : "s"} ready`
          : null;
      case "test":
        return status.activeAgentsCount > 0 ? "Agent published and live" : null;
      default:
        return key === "workspace" ? status.workspaceName : null;
    }
  }

  const icons = [Building2, Plug, Bot, Database, FlaskConical, Rocket];

  return (
    <div className="flex flex-col gap-4">
      <div>
        <div className="flex items-center justify-between text-xs font-medium text-muted-foreground">
          <span>{completedCount} of 6 complete</span>
          <span>{Math.round((completedCount / 6) * 100)}%</span>
        </div>
        <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={completedCount} aria-valuemin={0} aria-valuemax={6}>
          <div className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-emerald-400 transition-all" style={{ width: `${(completedCount / 6) * 100}%` }} />
        </div>
      </div>

      <div className="flex flex-col gap-2.5">
        {STEP_META.map((step) => {
          const Icon = icons[step.n - 1];
          const isDone = done[step.key];
          const action = stepAction(step.key);
          const note = stepNote(step.key);
          return (
            <Card key={step.key} className={cn(isDone && "border-emerald-500/30")}>
              <CardContent className="flex items-center gap-3.5 p-4">
                <span
                  className={cn(
                    "flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl",
                    isDone ? "bg-emerald-500/15 text-emerald-600" : "bg-muted text-muted-foreground",
                  )}
                >
                  {isDone ? <Check className="h-5 w-5" /> : <Icon className="h-5 w-5" />}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2 text-sm font-semibold">
                    <span className="text-muted-foreground">Step {step.n}</span> {step.title}
                    {isDone && <Badge variant="success">Done</Badge>}
                  </p>
                  <p className="mt-0.5 text-[13px] text-muted-foreground">{step.description}</p>
                  {note && <p className="mt-0.5 text-xs font-medium text-emerald-700 dark:text-emerald-300">{note}</p>}
                </div>
                {action && step.key !== "launch" && (
                  <Button asChild variant={isDone ? "outline" : "default"} size="sm" className="shrink-0">
                    <Link href={action.href}>
                      {action.label} <ArrowRight />
                    </Link>
                  </Button>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="flex flex-col gap-2 sm:flex-row">
        <Button onClick={finish} loading={pending} size="lg" className="flex-1">
          <Rocket /> {pending ? "Launching…" : "Launch dashboard"}
        </Button>
        <Button variant="outline" size="lg" onClick={finish} disabled={pending}>
          Skip for now
        </Button>
      </div>
      <p className="text-center text-xs text-muted-foreground">
        You can revisit setup anytime from Integrations, Agents and Knowledge.
      </p>
    </div>
  );
}
