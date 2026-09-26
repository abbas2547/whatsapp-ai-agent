"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CheckCircle2, Loader2, TriangleAlert, XCircle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatINR } from "@/services/billing/plans";

type Verified =
  | { state: "SUCCESS"; reference: string; amountPaise: number; planId?: string; interval?: string }
  | { state: "PENDING" | "PROCESSING"; reference: string; amountPaise: number }
  | { state: "FAILED" | "CANCELED" | "EXPIRED"; reference: string; amountPaise: number; reason?: string };

/**
 * Verifies an order against the backend (which re-checks Cashfree) and
 * renders ONLY the verified outcome. Never trusts the return URL.
 */
export function PaymentStatus({ orderId, expect }: { orderId: string; expect: "success" | "failed" }) {
  const [data, setData] = useState<Verified | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(true);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    async function check() {
      setChecking(true);
      setError(null);
      try {
        const res = await fetch(`/api/billing/status?order_id=${encodeURIComponent(orderId)}`, { cache: "no-store" });
        const json = (await res.json().catch(() => null)) as { ok?: boolean; order?: Verified; error?: string } | null;
        if (!res.ok || !json?.ok || !json.order) throw new Error(json?.error || "Could not verify payment.");
        if (!cancelled) setData(json.order);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Could not verify payment.");
      } finally {
        if (!cancelled) setChecking(false);
      }
    }
    check();
    return () => {
      cancelled = true;
    };
  }, [orderId, attempt]);

  // Auto-refresh while the provider is still confirming (max ~30s).
  useEffect(() => {
    if (!data || (data.state !== "PENDING" && data.state !== "PROCESSING")) return;
    const t = setTimeout(() => setAttempt((a) => (a >= 5 ? a : a + 1)), 6000);
    return () => clearTimeout(t);
  }, [data]);

  if (checking && !data) {
    return (
      <StatusShell icon={<Loader2 className="h-10 w-10 animate-spin text-primary" />} title="Verifying payment…">
        <p>Confirming with Cashfree — this can take a few seconds. Don&apos;t close this page.</p>
      </StatusShell>
    );
  }

  if (error && !data) {
    return (
      <StatusShell icon={<TriangleAlert className="h-10 w-10 text-amber-500" />} title="Couldn't verify yet">
        <p>{error}</p>
        <div className="mt-4 flex justify-center gap-2">
          <Button variant="outline" onClick={() => setAttempt((a) => a + 1)}>
            <RefreshCw /> Refresh status
          </Button>
          <Button asChild>
            <Link href="/billing">Go to billing</Link>
          </Button>
        </div>
      </StatusShell>
    );
  }

  if (!data) return null;
  const ok = data.state === "SUCCESS";

  if (ok) {
    return (
      <StatusShell icon={<CheckCircle2 className="h-12 w-12 text-emerald-500" />} title="Payment successful">
        <p>
          Reference <span className="font-mono font-semibold">{data.reference}</span>
          {data.planId ? (
            <>
              {" "}· <span className="font-semibold capitalize">{data.planId}</span> plan is now active
            </>
          ) : null}
          {data.amountPaise ? <> · {formatINR(data.amountPaise)}</> : null}.
        </p>
        {checking && <p className="text-xs">Re-confirming…</p>}
        <div className="mt-5 flex flex-col justify-center gap-2 sm:flex-row">
          <Button asChild size="lg">
            <Link href="/dashboard">Go to Dashboard</Link>
          </Button>
          <Button asChild variant="outline" size="lg">
            <Link href="/billing">Manage Subscription</Link>
          </Button>
        </div>
      </StatusShell>
    );
  }

  if (data.state === "PENDING" || data.state === "PROCESSING") {
    return (
      <StatusShell icon={<Loader2 className="h-10 w-10 animate-spin text-primary" />} title="Payment processing">
        <p>
          We&apos;re waiting for confirmation from the payment provider for{" "}
          <span className="font-mono font-semibold">{data.reference}</span>. This page updates automatically —
          nothing is activated until confirmed.
        </p>
        <div className="mt-4">
          <Button variant="outline" onClick={() => setAttempt((a) => a + 1)} loading={checking}>
            <RefreshCw /> Refresh status
          </Button>
        </div>
      </StatusShell>
    );
  }

  return (
    <StatusShell
      icon={<XCircle className="h-12 w-12 text-red-500" />}
      title={expect === "failed" || data.state !== "CANCELED" ? "Payment wasn't completed" : "Payment canceled"}
    >
      <p>
        Your account has <b>not</b> been upgraded
        {"reason" in data && data.reason ? `: ${data.reason}` : ""}. Any existing active subscription is unchanged.
      </p>
      <div className="mt-5 flex flex-col justify-center gap-2 sm:flex-row">
        <Button asChild size="lg">
          <Link href="/pricing">Try again</Link>
        </Button>
        <Button asChild variant="outline" size="lg">
          <Link href="/billing">Back to billing</Link>
        </Button>
      </div>
    </StatusShell>
  );
}

function StatusShell({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mx-auto flex w-full max-w-lg flex-col items-center rounded-3xl border border-border bg-card p-8 text-center shadow-sm sm:p-10">
      <div className="animate-pop-in">{icon}</div>
      <h1 className="mt-4 text-2xl font-extrabold tracking-tight">{title}</h1>
      <div className="mt-2 text-sm leading-6 text-muted-foreground">{children}</div>
    </div>
  );
}
