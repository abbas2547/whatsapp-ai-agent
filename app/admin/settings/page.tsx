import { redirect } from "next/navigation";
import { getAdminContext, adminEmail } from "@/lib/admin";
import { presenceThresholdMs } from "@/lib/presence";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/badge";

export default async function AdminSettingsPage() {
  const ctx = await getAdminContext();
  if (!ctx) redirect("/dashboard");
  const masked = (v?: string) => (!v ? "Not configured" : v.length <= 8 ? "••••" : `${v.slice(0, 3)}••••${v.slice(-2)}`);
  const rows: { k: string; v: string }[] = [
    { k: "Admin email", v: adminEmail() },
    { k: "Presence threshold", v: `${presenceThresholdMs() / 1000}s (heartbeat 45s)` },
    { k: "Database", v: process.env.DATABASE_URL ? "Configured" : "Not configured" },
    { k: "Redis", v: process.env.REDIS_URL ? "Configured (native / REST auto-detect)" : "Not configured" },
    { k: "AI provider", v: process.env.OPENROUTER_API_KEY ? `OpenRouter (${process.env.OPENROUTER_MODEL || "openai/gpt-4o-mini"})` : process.env.GEMINI_API_KEY ? "Gemini (legacy)" : "Not configured" },
    { k: "Meta app", v: masked(process.env.META_APP_ID) },
    { k: "Cashfree env", v: process.env.CASHFREE_ENVIRONMENT || "sandbox" },
    { k: "App URL", v: process.env.NEXT_PUBLIC_APP_URL || process.env.NEXTAUTH_URL || "local" },
  ];
  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Settings" description="Environment + operational knobs. Secrets are never displayed." />
      <Card><CardHeader><CardTitle>Configuration</CardTitle><CardDescription>Read from server environment</CardDescription></CardHeader>
        <CardContent className="flex flex-col divide-y divide-border">
          {rows.map((r) => (
            <div key={r.k} className="flex items-center justify-between gap-3 py-2.5 text-sm">
              <span className="text-muted-foreground">{r.k}</span><span className="font-mono text-xs font-medium">{r.v}</span>
            </div>
          ))}
        </CardContent></Card>
    </div>
  );
}
