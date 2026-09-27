import type { Metadata } from "next";
import Link from "next/link";
import { requireSessionOrRedirect } from "@/app/actions/session";
import { getAnalytics } from "@/services/analytics/analytics.service";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge, PageHeader } from "@/components/ui/badge";
import { StatCard } from "@/components/ui/stat";
import { Activity, ArrowDown, ArrowUp, Bot, CalendarCheck2, Crosshair, Fingerprint, MessageSquare, Timer, Zap, TriangleAlert } from "lucide-react";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Analytics" };
export const dynamic = "force-dynamic";

const RANGES = [
  { value: 7, label: "7 days" },
  { value: 30, label: "30 days" },
  { value: 90, label: "90 days" },
];

function fmtMs(ms: number | null) {
  if (ms == null) return "—";
  if (ms < 1000) return `${ms} ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)} s`;
  return `${(ms / 60000).toFixed(1)} min`;
}

export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await requireSessionOrRedirect();
  const sp = await searchParams;
  const raw = parseInt(typeof sp.range === "string" ? sp.range : "30", 10);
  const range = [7, 30, 90].includes(raw) ? raw : 30;

  // Never let a data failure trip the app error boundary ("Something went
  // wrong"). Render an inline, retryable state instead — data stays safe.
  let a: Awaited<ReturnType<typeof getAnalytics>>;
  try {
    a = await getAnalytics(session.user.organizationId!, range);
  } catch (error) {
    console.error("[analytics] load failed:", error instanceof Error ? error.message : "unknown");
    return (
      <div className="mx-auto flex max-w-2xl flex-col gap-4">
        <PageHeader title="Analytics" description={`Last ${range} days of activity in your workspace.`} />
        <Card className="p-8 text-center">
          <Activity className="mx-auto h-8 w-8 text-muted-foreground" />
          <h1 className="mt-3 text-xl font-semibold tracking-tight">We couldn&apos;t load analytics</h1>
          <p className="mx-auto mt-1 max-w-md text-sm leading-6 text-muted-foreground">
            Your data is safe — this is usually a temporary connection issue. Please try again.
          </p>
          <div className="mt-5 flex justify-center gap-2">
            <Button asChild>
              <Link href={`/analytics?range=${range}`}>Try again</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/dashboard">Go to dashboard</Link>
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  if (a.insufficient) {
    return (
      <div className="mx-auto max-w-2xl">
        <PageHeader title="Analytics" description={`Last ${range} days of activity in your workspace.`} />
        <Card className="mt-4 p-8 text-center">
          <Activity className="mx-auto h-8 w-8 text-muted-foreground" />
          <h1 className="mt-3 text-xl font-semibold tracking-tight">Not enough data yet</h1>
          <p className="mx-auto mt-1 max-w-md text-sm leading-6 text-muted-foreground">
            Analytics appear once there is activity in your workspace. Connect your WhatsApp number and publish an agent
            to get started.
          </p>
        </Card>
      </div>
    );
  }

  const stats = [
    { label: `Received (${range}d)`, value: a.received, icon: ArrowDown, tone: "blue" as const },
    { label: `Sent (${range}d)`, value: a.sent, icon: ArrowUp, tone: "default" as const },
    { label: "Conversations", value: a.conversations, icon: MessageSquare, tone: "default" as const },
    { label: "AI conversations", value: a.aiConversations, icon: Bot, tone: "green" as const },
    { label: "Human conversations", value: a.humanConversations, icon: Fingerprint, tone: "amber" as const },
    { label: "Handoff rate", value: `${a.handoffRate}%`, icon: Activity, tone: "amber" as const },
    { label: `Leads (${range}d)`, value: a.leadsCreated, icon: Crosshair, tone: "blue" as const },
    { label: "Qualified leads", value: a.qualifiedLeads, icon: Crosshair, tone: "green" as const },
    { label: "Appointments", value: a.appointments, icon: CalendarCheck2, tone: "default" as const },
    { label: "Avg response", value: fmtMs(a.avgResponseMs), icon: Timer, tone: "default" as const },
    { label: `Workflows (${range}d)`, value: a.workflowExecutions, icon: Zap, tone: "default" as const },
    { label: "Failed runs", value: a.workflowFailures, icon: TriangleAlert, tone: (a.workflowFailures > 0 ? "red" : "default") as "red" | "default" },
  ];

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-5">
      <PageHeader
        title="Analytics"
        description={`Last ${range} days of real activity in your workspace. No sampled or invented numbers.`}
        actions={
          <div className="flex rounded-xl border border-border bg-card p-1 text-xs font-semibold" role="tablist" aria-label="Date range">
            {RANGES.map((r) => (
              <Link
                key={r.value}
                href={`/analytics?range=${r.value}`}
                prefetch
                role="tab"
                aria-selected={range === r.value}
                className={cn("rounded-lg px-3 py-1.5 transition-all", range === r.value ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}
              >
                {r.label}
              </Link>
            ))}
          </div>
        }
      />

      <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 xl:grid-cols-4">
        {stats.map((s) => (
          <StatCard key={s.label} label={s.label} value={s.value} icon={s.icon} tone={s.tone} />
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>AI engagement</CardTitle>
          <CardDescription>How conversations are being handled.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2 text-sm">
            <Badge variant="success">AI handled {a.aiConversations} conversations</Badge>
            <Badge variant="default">Human handled {a.humanConversations} conversations</Badge>
            <Badge variant="warning">{a.handoffRate}% became human handoffs</Badge>
          </div>
          <p className="mt-3 text-sm text-muted-foreground">
            AI token usage in the period: <span className="font-semibold tabular-nums text-foreground">{a.aiUsage.toLocaleString()}</span>{" "}
            tokens.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
