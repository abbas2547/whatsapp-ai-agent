"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CreditCard, TriangleAlert } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { formatINR, type PlanDef } from "@/services/billing/plans";
import type { ActiveSubscription } from "@/services/billing/entitlements";

function statusBadge(status: string) {
  switch (status) {
    case "ACTIVE":
      return <Badge variant="success">Active</Badge>;
    case "PENDING":
      return <Badge variant="warning">Pending</Badge>;
    case "PAST_DUE":
      return <Badge variant="danger">Past due</Badge>;
    case "CANCELED":
      return <Badge variant="secondary">Canceled</Badge>;
    case "EXPIRED":
      return <Badge variant="secondary">Expired</Badge>;
    default:
      return <Badge variant="secondary">{status}</Badge>;
  }
}

export function SubscriptionCard({
  sub,
  plan,
  pricePaise,
}: {
  sub: ActiveSubscription;
  plan: PlanDef;
  pricePaise: number;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [confirm, setConfirm] = useState(false);
  const isFree = sub.planId === "free";
  const active = sub.effectiveStatus === "ACTIVE" && !isFree;

  function cancel() {
    startTransition(async () => {
      try {
        const res = await fetch("/api/billing/cancel", { method: "POST" });
        const data = (await res.json().catch(() => null)) as { ok?: boolean; error?: string; message?: string } | null;
        if (!res.ok || !data?.ok) throw new Error(data?.error || "Could not cancel subscription.");
        toast.success("Subscription canceled — paid period stays active until expiry.");
        setConfirm(false);
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Could not cancel subscription.");
      }
    });
  }

  return (
    <Card className={active ? "border-emerald-500/30" : undefined}>
      <CardHeader className="flex-row items-start justify-between gap-3 space-y-0">
        <div>
          <CardTitle className="flex items-center gap-2">
            <CreditCard className="h-4 w-4 text-muted-foreground" /> Current plan
          </CardTitle>
          <CardDescription>
            {isFree ? "You're exploring on the Free plan." : "Renews manually — pay again before expiry to continue without interruption."}
          </CardDescription>
        </div>
        {statusBadge(isFree ? "FREE" : sub.effectiveStatus)}
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <p className="text-2xl font-extrabold tracking-tight">{plan.name}</p>
          {!isFree && (
            <p className="text-sm text-muted-foreground tabular-nums">
              {formatINR(pricePaise)}/{sub.billingInterval === "annual" ? "year" : "month"}
            </p>
          )}
        </div>
        {!isFree && sub.currentPeriodEnd && (
          <p className="text-[13px] text-muted-foreground">
            {sub.cancelAtPeriodEnd ? "Lapses to Free on " : "Valid until "}
            <span className="font-semibold text-foreground">
              {sub.currentPeriodEnd.toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })}
            </span>
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          <Button asChild size="sm">
            <Link href="/pricing">{isFree ? "Upgrade" : "Manage plan"}</Link>
          </Button>
          {active && !sub.cancelAtPeriodEnd && (
            <Button variant="outline" size="sm" onClick={() => setConfirm(true)}>
              Cancel subscription
            </Button>
          )}
        </div>
        {sub.cancelAtPeriodEnd && (
          <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
            <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            Cancellation scheduled — the plan stays active until the paid period ends, then lapses to Free.
          </p>
        )}
      </CardContent>

      <Dialog open={confirm} onOpenChange={setConfirm}>
        <DialogContent>
          <DialogTitle>Cancel subscription?</DialogTitle>
          <p className="text-sm leading-6 text-muted-foreground">
            Your <b className="text-foreground">{plan.name}</b> plan stays active until{" "}
            <b className="text-foreground">
              {sub.currentPeriodEnd?.toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })}
            </b>
            , then lapses to Free. No further charges occur.
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setConfirm(false)}>
              Keep plan
            </Button>
            <Button variant="destructive" onClick={cancel} loading={pending}>
              Cancel subscription
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
