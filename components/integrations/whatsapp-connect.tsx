"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { connectWhatsAppAction } from "@/app/actions";
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
  const [waba, setWaba] = useState(wabaId || "");
  const [phoneNumberId, setPhoneNumberId] = useState("");
  const [token, setToken] = useState("");
  const [displayPhone, setDisplayPhone] = useState("");
  const [pending, startTransition] = useTransition();

  function connect() {
    startTransition(async () => {
      const result = await connectWhatsAppAction({
        wabaId: waba.trim(),
        phoneNumberId: phoneNumberId.trim(),
        accessToken: token.trim(),
        displayPhoneNumber: displayPhone.trim() || undefined,
      });
      if (result.ok) {
        toast.success("WhatsApp connected");
        setToken("");
        router.refresh();
      } else {
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
              Connect a Meta WhatsApp Business Account so your AI agents can reply to customers. Grab these values from
              your Meta Developer app.
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label>WABA ID</Label>
                <Input value={waba} onChange={(e) => setWaba(e.target.value)} placeholder="100000000000000" required />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Phone number ID</Label>
                <Input value={phoneNumberId} onChange={(e) => setPhoneNumberId(e.target.value)} placeholder="100000000000000" required />
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Permanent access token</Label>
              <Input
                type="password"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder="EAAG…"
                required
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Display phone number (optional)</Label>
              <Input value={displayPhone} onChange={(e) => setDisplayPhone(e.target.value)} placeholder="+1 555 000 1234" />
            </div>
            <Button onClick={connect} disabled={pending || !waba.trim() || !phoneNumberId.trim() || token.trim().length < 10}>
              {pending ? "Connecting…" : "Connect WhatsApp"}
            </Button>
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