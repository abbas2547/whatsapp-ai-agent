import type { Metadata } from "next";
import Link from "next/link";
import { requireSessionOrRedirect } from "@/app/actions";
import { db } from "@/lib/db";
import { getWhatsAppStatus } from "@/services/whatsapp/connect";
import { appUrl, env, isPlaceholder } from "@/lib/env";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge, PageHeader } from "@/components/ui/badge";
import { WhatsAppConnectCard } from "@/components/integrations/whatsapp-connect";
import { HttpIntegrationCard } from "@/components/integrations/http-integration";
import { CheckCircle2, ExternalLink } from "lucide-react";

export const metadata: Metadata = { title: "Integrations" };
export const dynamic = "force-dynamic";

export default async function IntegrationsPage() {
  const session = await requireSessionOrRedirect();
  const orgId = session.user.organizationId!;

  const [status, integrations] = await Promise.all([
    getWhatsAppStatus(orgId),
    db.integration.findMany({ where: { organizationId: orgId }, orderBy: { createdAt: "asc" } }),
  ]);

  const googleConfigured =
    !isPlaceholder(env().GOOGLE_CLIENT_ID) && !isPlaceholder(env().GOOGLE_CLIENT_SECRET);
  const googleConnected = integrations.some((i) => i.provider === "GOOGLE_CALENDAR");

  const httpIntegrations = integrations.filter((i) => i.provider === "HTTP");

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-5">
      <PageHeader title="Integrations" description="Connect the services your agents and automations use. Every status below is live." />

      <WhatsAppConnectCard
        connected={status.connected}
        webhookVerified={status.webhookVerified}
        phones={status.phones}
        wabaId={status.wabaId}
        webhookUrl={`${appUrl()}/api/webhooks/whatsapp`}
      />

      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle>Google Calendar + Gmail</CardTitle>
          {googleConnected ? <Badge variant="success">Connected</Badge> : <Badge variant="secondary">Not connected</Badge>}
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <p className="text-sm text-muted-foreground">
            Lets agents check availability, book appointments into your calendar, and send internal email
            notifications on handoffs.
          </p>
          {googleConfigured ? (
            googleConnected ? (
              <p className="flex items-center gap-2 text-sm">
                <CheckCircle2 className="h-4 w-4 text-emerald-600" /> Google is connected for this workspace.
              </p>
            ) : (
              <Button asChild size="sm">
                <a href="/api/integrations/google">
                  <ExternalLink className="h-4 w-4" /> Connect Google
                </a>
              </Button>
            )
          ) : (
            <p className="rounded-lg bg-muted p-3 text-sm text-muted-foreground">
              Google OAuth is not configured on the server (<code>GOOGLE_CLIENT_ID</code> /{" "}
              <code>GOOGLE_CLIENT_SECRET</code>). Add them to <code>.env.local</code> to enable calendar booking and
              Gmail notifications.
            </p>
          )}
        </CardContent>
      </Card>

      <HttpIntegrationCard existing={httpIntegrations} />

      <Card>
        <CardHeader>
          <CardTitle>Webhook</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Incoming webhooks trigger your workflows. Configure token-based webhooks programmatically via the{" "}
            <Link href="/automations" className="underline">
              automations
            </Link>{" "}
            engine.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}