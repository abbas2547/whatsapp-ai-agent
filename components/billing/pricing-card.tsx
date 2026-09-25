import { Check, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  formatINR,
  planPricePaise,
  annualSavingsPct,
  type BillingInterval,
  type PlanDef,
} from "@/services/billing/plans";

export type PlanCTA =
  | { kind: "current" }
  | { kind: "choose"; label: string };

export function PricingCard({
  plan,
  interval,
  cta,
  onChoose,
  choosing,
}: {
  plan: PlanDef;
  interval: BillingInterval;
  cta: PlanCTA;
  onChoose: (plan: PlanDef) => void;
  choosing: boolean;
}) {
  const price = planPricePaise(plan, interval);
  const featured = !!plan.popular;
  const isCurrent = cta.kind === "current";

  return (
    <div
      className={cn(
        "relative flex flex-col rounded-3xl border bg-card p-6 transition-all duration-200 sm:p-7",
        featured
          ? "border-primary/50 shadow-[0_20px_60px_-20px_var(--color-primary)] ring-1 ring-primary/30 lg:-my-3 lg:py-10"
          : "border-border shadow-sm hover:-translate-y-1 hover:shadow-lg",
        isCurrent && "border-emerald-500/50",
      )}
    >
      {featured && (
        <span className="absolute -top-3.5 left-1/2 flex -translate-x-1/2 items-center gap-1 whitespace-nowrap rounded-full bg-primary px-3.5 py-1 text-[11px] font-bold uppercase tracking-wider text-primary-foreground shadow">
          <Sparkles className="h-3 w-3" /> Most popular
        </span>
      )}
      {isCurrent && (
        <span className="absolute -top-3.5 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-emerald-600 px-3.5 py-1 text-[11px] font-bold uppercase tracking-wider text-white shadow">
          Current plan
        </span>
      )}

      <h3 className="text-lg font-bold tracking-tight">{plan.name}</h3>
      <p className="mt-1 min-h-10 text-[13px] leading-5 text-muted-foreground">{plan.description}</p>

      <div className="mt-4 flex items-end gap-1.5">
        <span className="text-4xl font-extrabold tracking-tight tabular-nums">{formatINR(price)}</span>
        <span className="pb-1.5 text-sm text-muted-foreground">/{interval === "annual" ? "year" : "month"}</span>
      </div>
      <p className="mt-1 h-5 text-xs text-muted-foreground">
        {interval === "annual" ? (
          <span>
            Billed annually · <span className="font-semibold text-emerald-600 dark:text-emerald-400">Save {annualSavingsPct(plan)}%</span>
          </span>
        ) : (
          "Billed monthly"
        )}
      </p>

      {isCurrent ? (
        <Button disabled variant="outline" className="mt-5 w-full" size="lg">
          Current plan
        </Button>
      ) : (
        <Button
          variant={featured ? "default" : "outline"}
          className="mt-5 w-full"
          size="lg"
          loading={choosing}
          onClick={() => onChoose(plan)}
        >
          {cta.kind === "choose" ? cta.label : "Choose plan"}
        </Button>
      )}

      <div className="my-5 h-px bg-border" />

      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Includes</p>
      <ul className="mt-2.5 flex flex-col gap-2">
        {plan.features.map((f) => (
          <li key={f} className="flex items-start gap-2 text-[13px] leading-5">
            <span className="mt-0.5 flex h-4.5 w-4.5 shrink-0 items-center justify-center rounded-full bg-emerald-500/15">
              <Check className="h-3 w-3 text-emerald-600 dark:text-emerald-400" />
            </span>
            <span>{f}</span>
          </li>
        ))}
      </ul>

      <div className="mt-4 flex flex-wrap gap-1.5">
        <Badge variant="secondary" title="Maximum AI employees on this plan">
          {plan.limits.maxAgents} agent{plan.limits.maxAgents === 1 ? "" : "s"}
        </Badge>
        <Badge variant="secondary" title="AI conversations included per month">
          {plan.limits.maxAIConversationsPerMonth.toLocaleString("en-IN")} AI chats/mo
        </Badge>
      </div>
    </div>
  );
}
