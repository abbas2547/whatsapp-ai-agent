import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import type { UsageSummary } from "@/services/billing/entitlements";

function Bar({ pct }: { pct: number }) {
  const tone = pct >= 100 ? "bg-red-500" : pct >= 80 ? "bg-amber-500" : "bg-gradient-to-r from-emerald-500 to-emerald-400";
  return (
    <div
      className="h-2.5 w-full overflow-hidden rounded-full bg-muted"
      role="progressbar"
      aria-valuenow={Math.round(pct)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div className={cn("h-full rounded-full transition-all", tone)} style={{ width: `${Math.min(100, Math.max(2, pct))}%` }} />
    </div>
  );
}

function Row({ label, used, limit, pct: p }: { label: string; used: number; limit: number; pct: number }) {
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between gap-2 text-[13px]">
        <span className="font-medium text-muted-foreground">{label}</span>
        <span className="font-bold tabular-nums">
          {used.toLocaleString("en-IN")} <span className="font-medium text-muted-foreground">/ {limit.toLocaleString("en-IN")}</span>
          <span className={cn("ml-2 text-xs", p >= 100 ? "text-red-600" : p >= 80 ? "text-amber-600" : "text-muted-foreground")}>
            {p.toFixed(1)}%
          </span>
        </span>
      </div>
      <Bar pct={p} />
    </div>
  );
}

export function UsageCard({ usage, title = "Usage", subtitle }: { usage: UsageSummary; title?: string; subtitle?: string }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {subtitle ? <CardDescription>{subtitle}</CardDescription> : null}
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <Row label="AI conversations" used={usage.aiConversationsUsed} limit={usage.aiConversationsLimit} pct={usage.aiConversationsPct} />
        <Row label="Contacts" used={usage.contactsUsed} limit={usage.contactsLimit} pct={usage.contactsPct} />
        <Row label="AI Employees" used={usage.agentsUsed} limit={usage.agentsLimit} pct={usage.agentsPct} />
        <Row label="WhatsApp numbers" used={usage.numbersUsed} limit={usage.numbersLimit} pct={usage.numbersPct} />
      </CardContent>
    </Card>
  );
}
