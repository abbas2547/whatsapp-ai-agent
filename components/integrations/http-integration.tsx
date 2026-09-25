"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { saveHttpIntegrationAction } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";
import { Select } from "@/components/ui/select";

export function HttpIntegrationCard({ existing }: { existing: { id: string; name: string; enabled: boolean }[] }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [method, setMethod] = useState<"GET" | "POST" | "PUT" | "PATCH">("POST");
  const [secret, setSecret] = useState("");
  const [pending, startTransition] = useTransition();

  function submit() {
    startTransition(async () => {
      const result = await saveHttpIntegrationAction({
        name: name.trim(),
        url: url.trim(),
        method,
        secret: secret.trim() || undefined,
      });
      if (result.ok) {
        toast.success("HTTP integration created");
        setName("");
        setUrl("");
        setSecret("");
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>HTTP integration</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <p className="text-sm text-muted-foreground">
          Preconfigured endpoints your agents and automations can call. Arbitrary URLs are never allowed from prompts.
        </p>
        {existing.length ? (
          <div className="flex flex-wrap gap-1.5">
            {existing.map((i) => (
              <span key={i.id} className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium">
                {i.name}
              </span>
            ))}
          </div>
        ) : null}
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label>Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="CRM sync" required />
          </div>
          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <Label>URL</Label>
            <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://api.example.com/leads" required />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Method</Label>
            <Select value={method} onChange={(e) => setMethod(e.target.value as "GET" | "POST" | "PUT" | "PATCH")}>
              {["GET", "POST", "PUT", "PATCH"].map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Auth header value (optional)</Label>
            <Input
              type="password"
              value={secret}
              onChange={(e) => setSecret(e.target.value)}
              placeholder="Bearer sk-…"
            />
          </div>
        </div>
        <Button onClick={submit} disabled={pending || !name.trim() || !url.trim()}>
          {pending ? "Saving…" : "Create integration"}
        </Button>
      </CardContent>
    </Card>
  );
}