"use client";

import { useEffect } from "react";

/** Visibility-aware heartbeat while authenticated. Stops on hidden tab / logout. */
export function PresenceHeartbeat() {
  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null;
    let stopped = false;
    async function beat() {
      if (stopped || document.visibilityState !== "visible") return;
      try {
        const res = await fetch("/api/presence/heartbeat", { method: "POST", keepalive: true });
        // Admin force-logout (or revoked session): clear the cookie
        // server-side and land on login instead of polling forever.
        if (res.status === 401) {
          stopped = true;
          // Full reload is intentional: the server clears the httpOnly
          // session cookie in this handler, so all client state is discarded.
          // eslint-disable-next-line @next/next/no-location-assign-relative-destination
          window.location.href = "/api/auth/force-logout";
        }
      } catch { /* offline — retry next tick */ }
    }
    beat();
    timer = setInterval(beat, 45_000);
    const onVis = () => { if (document.visibilityState === "visible") beat(); };
    document.addEventListener("visibilitychange", onVis);
    return () => { stopped = true; if (timer) clearInterval(timer); document.removeEventListener("visibilitychange", onVis); };
  }, []);
  return null;
}
