import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ArrowLeft } from "lucide-react";
import { auth } from "@/auth";
import { PricingView } from "@/components/billing/pricing-view";
import { getActiveSubscription, isPaidActive } from "@/services/billing/entitlements";
import { isBillingInterval, type PlanId } from "@/services/billing/plans";

export const metadata: Metadata = { title: "Pricing" };

export default async function PricingPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const preselectPlan = typeof sp.plan === "string" ? sp.plan : undefined;
  const preselectInterval = typeof sp.interval === "string" && isBillingInterval(sp.interval) ? sp.interval : undefined;

  // Logged-out visitors see prices + register CTA; never crash on bad config.
  let loggedIn = false;
  let currentPlanId: PlanId = "free";
  let paidActive = false;
  try {
    const session = await auth();
    if (session?.user?.id && session.user.organizationId) {
      loggedIn = true;
      const sub = await getActiveSubscription(session.user.organizationId);
      currentPlanId = sub.planId;
      paidActive = isPaidActive(sub);
    }
  } catch {
    loggedIn = false;
  }

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col px-4 py-10 sm:px-6 md:py-14">
      <Link
        href={loggedIn ? "/dashboard" : "/"}
        className="mb-6 inline-flex w-fit items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Back
      </Link>

      <div className="mx-auto mt-2 max-w-2xl text-center">
        <p className="text-sm font-semibold uppercase tracking-wider text-primary">Pricing</p>
        <h1 className="mt-2 text-balance text-3xl font-extrabold tracking-tight sm:text-4xl">
          Choose the right plan for your business
        </h1>
        <p className="mt-3 text-[15px] leading-7 text-muted-foreground">
          Automate WhatsApp conversations with an AI Employee. Upgrade, downgrade or renew anytime.
          Prices in INR, exclusive of GST.
        </p>
      </div>

      <div className="mt-6">
        <Suspense>
          <PricingView
            loggedIn={loggedIn}
            currentPlanId={currentPlanId}
            paidActive={paidActive}
            initialPlan={preselectPlan}
            initialInterval={preselectInterval}
          />
        </Suspense>
      </div>
    </div>
  );
}
