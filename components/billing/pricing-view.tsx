"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { BillingToggle } from "@/components/billing/billing-toggle";
import { PricingCard, type PlanCTA } from "@/components/billing/pricing-card";
import { CheckoutModal } from "@/components/billing/checkout-modal";
import { comparePlans } from "@/services/billing/payments";
import { getPaidPlans, type BillingInterval, type PlanDef, type PlanId } from "@/services/billing/plans";

/**
 * Client pricing experience. Plans/prices arrive as props from the server
 * (single source of truth) — the browser never invents amounts. Checkout
 * only ever sends { planId, interval }; the backend prices the order.
 */
export function PricingView({
  loggedIn,
  currentPlanId,
  paidActive,
  initialPlan,
  initialInterval,
}: {
  loggedIn: boolean;
  currentPlanId: PlanId;
  paidActive: boolean;
  initialPlan?: string;
  initialInterval?: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [interval, setInterval] = useState<BillingInterval>(initialInterval === "annual" ? "annual" : "monthly");
  const [selected, setSelected] = useState<PlanDef | null>(() => {
    if (!loggedIn) return null;
    const plans = getPaidPlans();
    return initialPlan ? (plans.find((p) => p.id === initialPlan) ?? null) : null;
  });
  const [choosing, setChoosing] = useState<PlanId | null>(null);

  const plans = useMemo(() => getPaidPlans(), []);

  function ctaFor(plan: PlanDef): PlanCTA {
    if (plan.id === currentPlanId && paidActive) return { kind: "current" };
    const rel = comparePlans(currentPlanId, plan.id);
    if (rel === "same") return { kind: "choose", label: "Switch to this plan" };
    return { kind: "choose", label: rel === "downgrade" ? `Downgrade to ${plan.name}` : `Upgrade to ${plan.name}` };
  }

  function choose(plan: PlanDef) {
    if (!loggedIn) {
      const next = `/pricing?plan=${plan.id}&interval=${interval}`;
      router.push(`/register?next=${encodeURIComponent(next)}`);
      return;
    }
    setChoosing(plan.id);
    setSelected(plan);
    setChoosing(null);
  }

  function closeModal() {
    setSelected(null);
    // Drop preselect params so refresh doesn't reopen checkout.
    const params = new URLSearchParams(searchParams.toString());
    params.delete("plan");
    params.delete("interval");
    const qs = params.toString();
    router.replace(qs ? `/pricing?${qs}` : "/pricing", { scroll: false });
  }

  return (
    <>
      <div className="flex justify-center">
        <BillingToggle interval={interval} onChange={setInterval} />
      </div>

      <div className="mx-auto mt-10 grid w-full max-w-6xl gap-5 lg:grid-cols-3 lg:gap-6">
        {plans.map((plan) => (
          <PricingCard
            key={plan.id}
            plan={plan}
            interval={interval}
            cta={ctaFor(plan)}
            choosing={choosing === plan.id}
            onChoose={choose}
          />
        ))}
      </div>

      <p className="mx-auto mt-8 max-w-2xl text-center text-xs leading-5 text-muted-foreground">
        Prices in INR, exclusive of GST. WhatsApp/Meta conversation or messaging charges may apply separately
        according to Meta&apos;s current pricing and policies. One-time purchase per billing period — renew manually
        before expiry to avoid interruption.
      </p>

      {!loggedIn && (
        <p className="mt-3 text-center text-sm text-muted-foreground">
          Already have an account?{" "}
          <Link href="/login" className="font-semibold text-primary hover:underline">
            Log in
          </Link>
        </p>
      )}

      <CheckoutModal plan={selected} interval={interval} open={!!selected} onClose={closeModal} />
    </>
  );
}
