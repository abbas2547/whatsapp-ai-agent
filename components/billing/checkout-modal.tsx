"use client";

import { useState } from "react";
import { ShieldCheck, TriangleAlert } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { formatINR, type BillingInterval, type PlanDef } from "@/services/billing/plans";
import { CashfreeCheckout } from "@/components/billing/cashfree-checkout";

interface OrderResponse {
  ok: boolean;
  reference?: string;
  orderId?: string;
  paymentSessionId?: string;
  amountPaise?: number;
  environment?: "sandbox" | "production";
  error?: string;
}

export function CheckoutModal({
  plan,
  interval,
  open,
  onClose,
}: {
  plan: PlanDef | null;
  interval: BillingInterval;
  open: boolean;
  onClose: () => void;
}) {
  const [phone, setPhone] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [session, setSession] = useState<{
    paymentSessionId: string;
    environment: "sandbox" | "production";
    reference: string;
  } | null>(null);

  function close() {
    if (creating) return;
    setError(null);
    setSession(null);
    onClose();
  }

  async function startCheckout() {
    if (!plan || creating) return;
    // Match server/Cashfree validation: 10-digit Indian mobile number.
    // Accept "+91…", "91…" or "0…" prefixes users commonly type.
    let digits = phone.replace(/[^\d]/g, "");
    if (digits.length === 12 && digits.startsWith("91")) digits = digits.slice(2);
    else if (digits.length === 11 && digits.startsWith("0")) digits = digits.slice(1);
    if (!/^[6-9]\d{9}$/.test(digits)) {
      setError("Enter a valid 10-digit Indian mobile number for the payment receipt.");
      return;
    }
    setCreating(true);
    setError(null);
    try {
      const res = await fetch("/api/billing/create-order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planId: plan.id, interval, customerPhone: digits }),
      });
      const data = (await res.json().catch(() => null)) as OrderResponse | null;
      if (!res.ok || !data?.ok || !data.paymentSessionId || !data.reference) {
        throw new Error(data?.error || "We couldn't start checkout. Please try again.");
      }
      setSession({
        paymentSessionId: data.paymentSessionId,
        environment: data.environment === "production" ? "production" : "sandbox",
        reference: data.reference,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "We couldn't start checkout. Please try again.");
    } finally {
      setCreating(false);
    }
  }

  const price = plan ? (interval === "annual" ? plan.annualPaise : plan.monthlyPaise) : 0;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && close()}>
      <DialogContent className="max-w-md">
        {!plan ? null : session ? (
          <CashfreeCheckout
            paymentSessionId={session.paymentSessionId}
            environment={session.environment}
            reference={session.reference}
            onClose={close}
          />
        ) : (
          <>
            <DialogTitle>Review your plan</DialogTitle>
            <div className="mt-1 rounded-2xl border border-border bg-muted/40 p-4">
              <div className="flex items-baseline justify-between gap-2">
                <p className="text-base font-bold">{plan.name}</p>
                <p className="text-xl font-extrabold tabular-nums">
                  {formatINR(price)}
                  <span className="text-xs font-medium text-muted-foreground"> /{interval === "annual" ? "year" : "month"}</span>
                </p>
              </div>
              <p className="mt-1 text-[13px] text-muted-foreground">
                {plan.limits.maxAgents} AI Employee{plan.limits.maxAgents === 1 ? "" : "s"} ·{" "}
                {plan.limits.maxAIConversationsPerMonth.toLocaleString("en-IN")} AI conversations/month
              </p>
              {interval === "annual" && (
                <p className="mt-1 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                  Annual billing — you save 20% vs monthly.
                </p>
              )}
              <div className="mt-3 flex items-baseline justify-between border-t border-border pt-3">
                <p className="text-sm font-semibold">Total due today</p>
                <p className="text-lg font-extrabold tabular-nums">{formatINR(price)}</p>
              </div>
              <p className="mt-1 text-[11px] text-muted-foreground">
                One-time purchase for this {interval === "annual" ? "year" : "month"}. WhatsApp/Meta conversation
                charges may apply separately per Meta&apos;s pricing.
              </p>
            </div>

            <div>
              <Label htmlFor="cf-phone">Phone number for receipt</Label>
              <Input
                id="cf-phone"
                inputMode="tel"
                autoComplete="tel"
                placeholder="98765 43210"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                maxLength={16}
              />
            </div>

            {error ? (
              <p className="flex items-start gap-1.5 text-xs font-medium text-red-600 dark:text-red-400" role="alert">
                <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {error}
              </p>
            ) : null}

            <div className="flex gap-2">
              <Button variant="outline" onClick={close} disabled={creating} className="flex-1">
                Cancel
              </Button>
              <Button onClick={startCheckout} loading={creating} className="flex-1">
                {creating ? "Creating secure checkout…" : "Continue to Payment"}
              </Button>
            </div>
            <p className="flex items-center justify-center gap-1.5 text-[11px] text-muted-foreground">
              <ShieldCheck className="h-3.5 w-3.5" /> Secured by Cashfree · UPI, cards, netbanking
            </p>
            <p className="text-center text-[11px] text-muted-foreground">
              If Cashfree shows “Broken Link / domain not enabled”, your domain must be whitelisted + approved in the
              same Test/Production mode — see Billing → Payment configuration.
            </p>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
