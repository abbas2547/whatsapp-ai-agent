import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { publicErrorMessage } from "@/lib/errors";
import { getClientIp, rateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

/**
 * Safe self-diagnostics for login failures. Returns ONLY booleans, hostnames
 * and timings — never secret values, passwords, or connection strings.
 * Used to tell apart: wrong production URLs, unreachable database (e.g.
 * Supabase direct connection from serverless without the pooler), blocked
 * outbound network to Google, or missing env vars — without needing access
 * to the hosting logs.
 */
export async function GET(request: Request) {
  const limited = rateLimit(`diag:${getClientIp(request)}`, 10, 60_000);
  if (!limited.success) {
    return NextResponse.json({ ok: false, error: "Rate limited. Try again in a minute." }, { status: 429 });
  }

  // --- Request host vs configured host (the localhost-bounce misconfig) ---
  const rawHost =
    request.headers.get("x-forwarded-host")?.split(",")[0]?.trim() ||
    request.headers.get("host") ||
    "";
  const requestHost = rawHost.split(":")[0]?.toLowerCase() || "";

  let configuredHost = "";
  let envError: string | null = null;
  let secretLength = 0;
  let googleId = false;
  let googleSecret = false;
  let databaseUrlSet = false;
  let dbHost: string | null = null;
  try {
    const { env, appUrl } = await import("@/lib/env");
    const e = env();
    configuredHost = new URL(appUrl()).hostname.toLowerCase();
    secretLength = e.NEXTAUTH_SECRET?.length || 0;
    googleId = !!(e.GOOGLE_CLIENT_ID && e.GOOGLE_CLIENT_ID.trim());
    googleSecret = !!(e.GOOGLE_CLIENT_SECRET && e.GOOGLE_CLIENT_SECRET.trim());
    databaseUrlSet = !!(e.DATABASE_URL && e.DATABASE_URL.trim());
    try {
      // Hostname only — URL parsing drops user/password automatically, and we
      // never echo the raw value.
      dbHost = new URL(e.DATABASE_URL).hostname || null;
    } catch {
      dbHost = null;
    }
  } catch (error) {
    envError = error instanceof Error ? error.message : "Invalid environment configuration";
  }

  // --- Database reachability (SELECT 1 with a hard timeout) ---
  let database: { reachable: boolean; latencyMs?: number; error?: string } = { reachable: false };
  if (!envError && databaseUrlSet) {
    const started = Date.now();
    try {
      await Promise.race([
        db.$queryRaw`SELECT 1`,
        new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), 8000)),
      ]);
      database = { reachable: true, latencyMs: Date.now() - started };
    } catch (error) {
      database = {
        reachable: false,
        error:
          error instanceof Error && error.message === "timeout"
            ? "Connection timed out after 8s (wrong host/port, firewall, or pool exhaustion)."
            : publicErrorMessage(error),
      };
    }
  } else if (envError) {
    database = { reachable: false, error: "Skipped: environment invalid." };
  }

  // --- Google reachability (server-to-server egress for the token exchange) ---
  let google: { reachable: boolean; latencyMs?: number; error?: string } = { reachable: false };
  try {
    const started = Date.now();
    const res = await fetch("https://accounts.google.com/.well-known/openid-configuration", {
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    google = { reachable: true, latencyMs: Date.now() - started };
  } catch {
    google = { reachable: false, error: "Cannot reach Google from this server (blocked outbound network)." };
  }

  return NextResponse.json({
    ok: !envError && database.reachable && google.reachable,
    checkedAt: new Date().toISOString(),
    host: {
      request: requestHost || null,
      configured: configuredHost || null,
      match: !!requestHost && !!configuredHost && requestHost === configuredHost,
    },
    env: {
      valid: !envError,
      envError,
      secretLength,
      secretOk: secretLength >= 32,
      googleId,
      googleSecret,
      databaseUrl: databaseUrlSet,
      dbHost,
    },
    database,
    google,
  });
}
