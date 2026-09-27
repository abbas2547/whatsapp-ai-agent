"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowRight, Eye, EyeOff } from "lucide-react";
import { connectWhatsAppAction } from "@/app/actions/whatsapp";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

export function WhatsAppConnectCard({
  connected,
  webhookVerified,
  phones,
  wabaId,
  webhookUrl,
}: {
  connected: boolean;
  webhookVerified: boolean;
  phones: { id: string; displayPhoneNumber: string; verifiedName?: string | null; qualityRating?: string | null }[];
  wabaId?: string | null;
  webhookUrl: string;
}) {
  const router = useRouter();
  const [clientId, setClientId] = useState(wabaId || "");
  const [clientSecret, setClientSecret] = useState("");
  const [showSecret, setShowSecret] = useState(false);
  const [pending, startTransition] = useTransition();
  const [failure, setFailure] = useState<{ message: string; upgradePlan?: "starter" | "pro" | "business" } | null>(null);

  function connect() {
    startTransition(async () => {
      setFailure(null);
      const result = await connectWhatsAppAction({
        clientId: clientId.trim(),
        clientSecret: clientSecret.trim(),
      });
      if (result.ok) {
        toast.success("WhatsApp connected");
        setClientSecret("");
        router.refresh();
      } else {
        setFailure({
          message: result.error,
          upgradePlan: "upgradePlan" in result ? (result.upgradePlan as "starter" | "pro" | "business" | undefined) : undefined,
        });
        toast.error(result.error);
      }
    });
  }

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle>WhatsApp Cloud API</CardTitle>
        {connected ? (
          <Badge variant="success">
            Connected{webhookVerified ? " · webhook verified" : " · webhook pending"}
          </Badge>
        ) : (
          <Badge variant="secondary">Not connected</Badge>
        )}
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {connected ? (
          phones.map((p) => (
            <div key={p.id} className="flex items-center justify-between text-sm">
              <div>
                <p className="font-medium">{p.displayPhoneNumber}</p>
                <p className="text-xs text-muted-foreground">
                  {p.verifiedName || "Unverified name"}
                  {p.qualityRating ? ` · ${p.qualityRating}` : ""}
                </p>
              </div>
              <Badge variant="outline">Default number</Badge>
            </div>
          ))
        ) : (
          <>
            <p className="text-sm text-muted-foreground">
              Connect your Meta WhatsApp Business Account so your AI agents can reply to customers.
            </p>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="wa-client-id">
                Client ID <span className="text-red-500">*</span>
              </Label>
              <Input
                id="wa-client-id"
                value={clientId}
                onChange={(e) => setClientId(e.target.value)}
                placeholder="Your WhatsApp Business Account ID"
                autoComplete="off"
                required
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="wa-client-secret">
                Client Secret <span className="text-red-500">*</span>
              </Label>
              <div className="relative">
                <Input
                  id="wa-client-secret"
                  type={showSecret ? "text" : "password"}
                  value={clientSecret}
                  onChange={(e) => setClientSecret(e.target.value)}
                  placeholder="EAA… (access token — not the App Secret)"
                  autoComplete="off"
                  className="pr-11"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowSecret((v) => !v)}
                  aria-label={showSecret ? "Hide client secret" : "Show client secret"}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground"
                >
                  {showSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
            <p className="text-xs leading-5 text-muted-foreground">
              Paste an <b>access token</b> (starts with EAA…) from WhatsApp → API Setup — not the App Secret from App
              Settings. Enterprise plan users can pull in credentials from external vaults.{" "}
              <a
                href="https://developers.facebook.com/docs/whatsapp/cloud-api/get-started"
                target="_blank"
                rel="noreferrer"
                className="font-medium text-primary hover:underline"
              >
                More info
              </a>
            </p>
            <Button onClick={connect} disabled={pending || !clientId.trim() || clientSecret.trim().length < 10}>
              {pending ? "Connecting…" : "Connect WhatsApp"}
            </Button>
            {failure ? (
              <div className="rounded-xl border border-red-500/30 bg-red-500/[0.06] p-3" role="alert">
                <p className="text-[13px] font-medium">{failure.message}</p>
                {failure.upgradePlan ? (
                  <Link
                    href={`/pricing?plan=${failure.upgradePlan}`}
                    className="mt-1.5 inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
                  >
                    Upgrade to {failure.upgradePlan === "starter" ? "Starter" : failure.upgradePlan === "pro" ? "Pro" : "Business"} to connect more <ArrowRight className="h-3 w-3" />
                  </Link>
                ) : null}
              </div>
            ) : null}
          </>
        )}
        <div className="rounded-lg bg-muted p-3">
          <p className="text-xs font-semibold text-muted-foreground">Webhook URL (configure in Meta)</p>
          <code className="mt-1 block break-all text-xs">{webhookUrl}</code>
          <p className="mt-1 text-[11px] text-muted-foreground">Use your WhatsApp verify token from environment variables.</p>
        </div>
      </CardContent>
    </Card>
  );
}
