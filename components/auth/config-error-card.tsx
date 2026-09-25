import { TriangleAlert } from "lucide-react";

function hintFor(message: string | undefined): string {
  const m = (message || "").toLowerCase();
  if (m.includes("database_url")) {
    return "The DATABASE_URL environment variable is missing or invalid. Add your Supabase/Postgres connection string in the hosting dashboard (Vercel → Project → Settings → Environment Variables), then redeploy.";
  }
  if (m.includes("nextauth_secret")) {
    return "The NEXTAUTH_SECRET environment variable is missing (min 16 characters). Generate one with `openssl rand -base64 32`, add it in the hosting dashboard, then redeploy.";
  }
  if (m.includes("environment configuration")) {
    return "A required environment variable is missing or invalid. Check DATABASE_URL and NEXTAUTH_SECRET in the hosting dashboard, then redeploy.";
  }
  return "The server could not start authentication. Check the deployment logs and environment variables, then redeploy.";
}

/**
 * Rendered on login/register instead of a crash page when the deployment
 * is misconfigured. Never exposes secret values — only variable names.
 */
export function ConfigErrorCard({ message }: { message?: string }) {
  return (
    <div
      className="rounded-xl border border-amber-500/40 bg-amber-500/[0.07] p-4"
      role="alert"
    >
      <p className="flex items-center gap-2 text-sm font-semibold text-amber-700 dark:text-amber-300">
        <TriangleAlert className="h-4 w-4 shrink-0" /> Login is temporarily unavailable
      </p>
      <p className="mt-1.5 text-[13px] leading-6 text-muted-foreground">{hintFor(message)}</p>
      {message ? (
        <p className="mt-2 rounded-lg bg-muted px-2.5 py-1.5 font-mono text-[11px] text-muted-foreground">
          {message.replace(/=[^;]*/g, "=…")}
        </p>
      ) : null}
    </div>
  );
}
