import { headers } from "next/headers";
import { TriangleAlert } from "lucide-react";
import { appUrl } from "@/lib/env";

const LOOPBACK = new Set(["localhost", "127.0.0.1", "::1", "[::1]", ""]);

/**
 * Shows only when the configured URL doesn't match where the app is served
 * from — the two classic misconfigurations:
 *  1. Public domain served while configured for localhost → Google login
 *     bounces to localhost:3000 (Auth.js builds all OAuth URLs from
 *     NEXTAUTH_URL when it is set).
 *  2. Local dev served while configured for a public domain (production
 *     URLs pasted into the local .env file) → login bounces to the live
 *     site instead of finishing here.
 * Renders nothing when the hosts match.
 */
export async function ProdUrlWarning() {
  let reqHost = "";
  try {
    const h = await headers();
    const raw = h.get("x-forwarded-host")?.split(",")[0]?.trim() || h.get("host") || "";
    reqHost = raw.split(":")[0]?.toLowerCase() || "";
  } catch {
    return null;
  }
  if (LOOPBACK.has(reqHost)) return null;
  let appHost = "";
  try {
    appHost = new URL(appUrl()).hostname.toLowerCase();
  } catch {
    return null;
  }
  if (LOOPBACK.has(reqHost)) {
    // Local request: warn only if the app is configured for a public domain
    // (production URLs leaked into the local env file).
    if (LOOPBACK.has(appHost)) return null;
    return (
      <div
        className="mb-4 rounded-xl border border-amber-500/40 bg-amber-500/[0.07] p-4"
        role="alert"
      >
        <p className="flex items-center gap-2 text-sm font-semibold text-amber-700 dark:text-amber-300">
          <TriangleAlert className="h-4 w-4 shrink-0" /> Logins will jump to the live site
        </p>
        <p className="mt-1.5 text-[13px] leading-6 text-muted-foreground">
          You opened this dev server at <b className="text-foreground">{reqHost}</b> but the
          app is configured for <span className="font-mono">{appHost}</span>, so signing in
          bounces to the live site instead of finishing here. In your local{" "}
          <span className="font-mono">.env.local</span> set{" "}
          <span className="font-mono">NEXT_PUBLIC_APP_URL</span> and{" "}
          <span className="font-mono">NEXTAUTH_URL</span> to{" "}
          <span className="font-mono">http://localhost:3000</span> (one value each, no
          duplicates), then restart the dev server. Production URLs belong only in the
          hosting dashboard.
        </p>
      </div>
    );
  }
  if (!LOOPBACK.has(appHost)) return null;

  const publicUrl = `https://${reqHost}`;
  return (
    <div
      className="mb-4 rounded-xl border border-amber-500/40 bg-amber-500/[0.07] p-4"
      role="alert"
    >
      <p className="flex items-center gap-2 text-sm font-semibold text-amber-700 dark:text-amber-300">
        <TriangleAlert className="h-4 w-4 shrink-0" /> Logins will break on this domain
      </p>
      <p className="mt-1.5 text-[13px] leading-6 text-muted-foreground">
        This site is served from <b className="text-foreground">{reqHost}</b> but the app is
        configured for localhost, so Google sign-in and payment links point at{" "}
        <span className="font-mono">localhost:3000</span> instead of here. In the hosting
        dashboard set <span className="font-mono">NEXT_PUBLIC_APP_URL</span> and{" "}
        <span className="font-mono">NEXTAUTH_URL</span> to{" "}
        <span className="font-mono">{publicUrl}</span>, then redeploy.
      </p>
    </div>
  );
}
