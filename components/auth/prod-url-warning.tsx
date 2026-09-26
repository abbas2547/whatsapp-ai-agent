import { headers } from "next/headers";
import { TriangleAlert } from "lucide-react";
import { appUrl } from "@/lib/env";

const LOOPBACK = new Set(["localhost", "127.0.0.1", "::1", "[::1]", ""]);

/**
 * Shows only when the app is served from a public domain while configured
 * for localhost — the classic "Google login bounces to localhost:3000"
 * production misconfiguration (Auth.js builds all OAuth URLs from
 * NEXTAUTH_URL when it is set). Renders nothing in local dev and nothing
 * when production URLs are correct.
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
