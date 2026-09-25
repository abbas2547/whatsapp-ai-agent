import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ArrowLeft } from "lucide-react";
import { PaymentStatus } from "@/components/billing/payment-status";

export const metadata: Metadata = { title: "Payment result" };

/**
 * Cashfree returns here after checkout. NOTHING is trusted from the URL —
 * PaymentStatus re-verifies the order with the backend (which re-checks
 * Cashfree) and renders only the verified outcome.
 */
export default async function BillingSuccessPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const orderId = typeof sp.order_id === "string" ? sp.order_id : null;

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col px-4 py-10 sm:px-6 md:py-16">
      <Link href="/billing" className="mb-6 inline-flex w-fit items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Billing
      </Link>
      {orderId ? (
        <Suspense>
          <PaymentStatus orderId={orderId} expect="success" />
        </Suspense>
      ) : (
        <div className="mx-auto flex w-full max-w-lg flex-col items-center rounded-3xl border border-border bg-card p-8 text-center">
          <h1 className="text-xl font-extrabold tracking-tight">No order to verify</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            This page needs an order reference from checkout. Check your billing page for the latest status.
          </p>
          <Link href="/billing" className="mt-4 text-sm font-semibold text-primary hover:underline">
            Go to billing
          </Link>
        </div>
      )}
    </div>
  );
}
