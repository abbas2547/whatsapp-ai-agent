"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";

declare global {
  interface Window {
    Cashfree?: (config: { mode: "sandbox" | "production" }) => {
      checkout: (options: { paymentSessionId: string; redirectTarget?: "_self" | "_blank" | "_top" }) => Promise<unknown>;
    };
  }
}

const SDK_URL = "https://sdk.cashfree.com/js/v3/cashfree.js";

function loadSdk(): Promise<void> {
  if (typeof window.Cashfree === "function") return Promise.resolve();
  const existing = document.querySelector(`script[src="${SDK_URL}"]`);
  if (existing) {
    return new Promise((resolve, reject) => {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error("SDK load failed")), { once: true });
    });
  }
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = SDK_URL;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Could not load the payment widget. Check your connection and try again."));
    document.head.appendChild(script);
  });
}

/**
 * Opens Cashfree web checkout. The SDK is loaded lazily here — never
 * globally — and only ever receives the server-issued payment session id.
 */
export function CashfreeCheckout({
  paymentSessionId,
  environment,
  reference,
  onClose,
}: {
  paymentSessionId: string;
  environment: "sandbox" | "production";
  reference: string;
  onClose: () => void;
}) {
  const [phase, setPhase] = useState<"loading" | "opening" | "error">("loading");
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    let cancelled = false;
    (async () => {
      try {
        await loadSdk();
        if (cancelled) return;
        const cashfree = window.Cashfree?.({ mode: environment });
        if (!cashfree) throw new Error("Payment widget unavailable. Please try again.");
        setPhase("opening");
        // Redirect-target checkout: Cashfree takes over and returns to
        // /billing/success, where the backend verifies the payment.
        await cashfree.checkout({ paymentSessionId, redirectTarget: "_self" });
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Could not open payment.");
          setPhase("error");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [paymentSessionId, environment]);

  if (phase === "error") {
    return (
      <div className="flex flex-col items-center gap-3 rounded-2xl border border-red-500/30 bg-red-500/[0.06] p-6 text-center">
        <TriangleAlert className="h-6 w-6 text-red-500" />
        <p className="text-sm font-semibold">We couldn&apos;t open payment</p>
        <p className="text-[13px] text-muted-foreground">
          {error} Your reference is <span className="font-mono font-semibold">{reference}</span> — quote it if you contact support.
        </p>
        <Button variant="outline" onClick={onClose}>
          Back
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-3 py-8 text-center" role="status" aria-live="polite">
      <Loader2 className="h-7 w-7 animate-spin text-primary" />
      <p className="text-sm font-semibold">{phase === "loading" ? "Creating secure checkout…" : "Opening payment…"}</p>
      <p className="max-w-xs text-xs text-muted-foreground">
        {environment === "sandbox" ? "Test mode — no real money moves. " : ""}
        You&apos;ll complete payment on Cashfree&apos;s secure page.
      </p>
    </div>
  );
}
