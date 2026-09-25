"use client";

import { cn } from "@/lib/utils";
import type { BillingInterval } from "@/services/billing/plans";

export function BillingToggle({
  interval,
  onChange,
}: {
  interval: BillingInterval;
  onChange: (v: BillingInterval) => void;
}) {
  return (
    <div
      role="radiogroup"
      aria-label="Billing period"
      className="inline-flex items-center rounded-full border border-border bg-card p-1 shadow-sm"
    >
      {(
        [
          ["monthly", "Monthly"],
          ["annual", "Annual"],
        ] as [BillingInterval, string][]
      ).map(([value, label]) => {
        const active = interval === value;
        return (
          <button
            key={value}
            role="radio"
            aria-checked={active}
            onClick={() => onChange(value)}
            className={cn(
              "relative rounded-full px-5 py-2 text-sm font-semibold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              active ? "bg-primary text-primary-foreground shadow" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {label}
            {value === "annual" && (
              <span
                className={cn(
                  "ml-1.5 rounded-full px-1.5 py-0.5 text-[11px] font-bold",
                  active ? "bg-white/20 text-white" : "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
                )}
              >
                −20%
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
