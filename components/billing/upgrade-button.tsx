import Link from "next/link";
import { ArrowUpRight, BadgeCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import type { PlanId } from "@/services/billing/plans";

/**
 * Navbar Upgrade CTA with honest states:
 *  - business + active → "Current plan" (nothing higher to sell)
 *  - any paid active → "Manage plan"
 *  - otherwise → "Upgrade"
 */
export function UpgradeButton({
  planId,
  paidActive,
  mobile = false,
}: {
  planId: PlanId;
  paidActive: boolean;
  mobile?: boolean;
}) {
  const top = planId === "business" && paidActive;
  const label = top ? "Current plan" : paidActive ? "Manage plan" : "Upgrade";
  return (
    <Link
      href="/pricing"
      className={cn(
        "items-center gap-1.5 rounded-xl text-[13px] font-bold shadow-sm transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        mobile ? "flex w-full px-3 py-2.5" : "hidden sm:flex h-9 px-3.5",
        top
          ? "border border-border bg-card text-muted-foreground hover:bg-muted"
          : "bg-primary text-primary-foreground hover:brightness-110 active:scale-[0.98]",
      )}
      title={top ? "You're on our highest plan" : "View plans and upgrade"}
    >
      {top ? <BadgeCheck className="h-4 w-4" /> : null}
      {label}
      {!top && <ArrowUpRight className="h-4 w-4" />}
    </Link>
  );
}
