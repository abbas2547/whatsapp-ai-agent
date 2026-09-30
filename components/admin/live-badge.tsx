"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

/** Live indicator for the admin console. Uses SSE with polling fallback. */
export function LiveBadge() {
  const [live, setLive] = useState(false);
  const [lastAt, setLastAt] = useState<Date | null>(null);

  useEffect(() => {
    let es: EventSource | null = null;
    let poll: ReturnType<typeof setInterval> | null = null;
    let alive = true;
    function markLive() {
      if (!alive) return;
      setLive(true);
      setLastAt(new Date());
    }
    function markDead() {
      if (!alive) return;
      setLive(false);
    }
    try {
      es = new EventSource("/api/admin/events");
      es.onopen = markLive;
      es.onmessage = markLive;
      es.onerror = markDead;
    } catch {
      // Initial state is already offline; SSE callbacks will mark live.
    }
    // Fallback: if SSE never opens (proxy/firewall), poll overview lightly.
    poll = setInterval(async () => {
      try {
        const r = await fetch("/api/admin/overview", { cache: "no-store" });
        if (r.ok && alive) {
          setLive(true);
          setLastAt(new Date());
        }
      } catch {
        if (alive) setLive(false);
      }
    }, 30_000);
    return () => {
      alive = false;
      es?.close();
      if (poll) clearInterval(poll);
    };
  }, []);

  return (
    <span
      className={cn(
        "flex h-9 items-center gap-2 rounded-xl border px-3 text-xs font-semibold",
        live ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" : "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300",
      )}
      role="status"
      title={lastAt ? `Last update ${lastAt.toLocaleTimeString()}` : "Connecting…"}
    >
      <span className={cn("h-2 w-2 rounded-full", live ? "bg-emerald-500" : "bg-amber-500 animate-pulse")} aria-hidden />
      {live ? "Live" : "Reconnecting…"}
    </span>
  );
}
