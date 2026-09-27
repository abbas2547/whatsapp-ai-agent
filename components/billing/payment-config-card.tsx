import { TriangleAlert, CircleCheck } from "lucide-react";
import { getCashfreeConfig, cashfreeEnv } from "@/services/billing/cashfree";
import { appUrl } from "@/lib/env";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

/**
 * Server-only diagnostics (no secrets rendered): shows the exact values the
 * app sends Cashfree so domain-whitelisting problems ("Broken Link") can be
 * verified without server-log access. Safe for any workspace member.
 */
export function PaymentConfigCard() {
  const cfg = getCashfreeConfig();
  const url = appUrl();
  const returnUrl = `${url}/billing/success`;
  const notifyUrl = `${url}/api/webhooks/cashfree`;
  const env = cfg?.env ?? cashfreeEnv();

  let domain = "";
  try {
    domain = new URL(returnUrl).host;
  } catch {
    domain = "";
  }

  const looksTestKey = cfg ? cfg.appId.toUpperCase().startsWith("TEST") : false;
  const match =
    !cfg
      ? "missing"
      : looksTestKey && env === "production"
        ? "mismatch"
        : !looksTestKey && env === "sandbox"
          ? "uncertain"
          : "consistent";

  return (
    <Card>
      <CardHeader>
        <CardTitle>Payment configuration</CardTitle>
        <CardDescription>
          Non-secret diagnostics. If Cashfree shows “Broken Link / domain not enabled”, compare these with your
          Merchant Dashboard.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-2.5 text-sm">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-muted-foreground">Environment:</span>
          <Badge variant={env === "production" ? "success" : "warning"}>
            {env === "production" ? "Production (live money)" : "Test (sandbox)"}
          </Badge>
          <span className="text-muted-foreground">Credentials:</span>
          {!cfg ? (
            <Badge variant="danger">Not configured</Badge>
          ) : looksTestKey ? (
            <Badge variant="info">TEST key</Badge>
          ) : (
            <Badge variant="secondary">Live-format key (ends …{cfg.appId.slice(-4)})</Badge>
          )}
          {match === "consistent" ? (
            <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600 dark:text-emerald-400">
              <CircleCheck className="h-3.5 w-3.5" /> Key type matches environment
            </span>
          ) : match === "mismatch" ? (
            <span className="inline-flex items-center gap-1 text-xs font-medium text-red-600 dark:text-red-400">
              <TriangleAlert className="h-3.5 w-3.5" /> TEST key with Production mode — checkout will fail. Use live
              credentials or switch CASHFREE_ENVIRONMENT to sandbox.
            </span>
          ) : match === "uncertain" ? (
            <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-600 dark:text-amber-400">
              <TriangleAlert className="h-3.5 w-3.5" /> Sandbox mode but key doesn&apos;t look like a TEST key — confirm
              you pasted TEST credentials from the dashboard&apos;s Test mode.
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-xs font-medium text-red-600 dark:text-red-400">
              <TriangleAlert className="h-3.5 w-3.5" /> Set CASHFREE_APP_ID and CASHFREE_SECRET_KEY to enable payments.
            </span>
          )}
        </div>
        <div className="grid gap-1.5 rounded-xl bg-muted p-3 font-mono text-xs">
          <p>
            <span className="font-sans font-semibold text-muted-foreground">Return URL: </span>
            <span className="break-all">{returnUrl}</span>
          </p>
          <p>
            <span className="font-sans font-semibold text-muted-foreground">Notify URL: </span>
            <span className="break-all">{notifyUrl}</span>
          </p>
        </div>
        {domain ? (
          <p className="text-[13px] leading-5 text-muted-foreground">
            Cashfree must show <span className="font-semibold text-foreground">https://{domain}</span> as{" "}
            <span className="font-semibold text-foreground">Approved</span> under Developers → Whitelisting in the{" "}
            <span className="font-semibold text-foreground">{env === "production" ? "Production" : "Test"}</span> mode
            of merchant.cashfree.com — same mode as above. After approval, always start a brand-new checkout (old
            payment links stay broken).
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
